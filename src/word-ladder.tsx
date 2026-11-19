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
  const [routePage, setRoutePage] = useState(0)
  const [exploration, setExploration] = useState<ExplorationResult | null>(null)
  const [mode, setMode] = useState<'target' | 'explore' | 'ordered'>('target')
  const [waypointInput, setWaypointInput] = useState('')
  const [waypointsTouched, setWaypointsTouched] = useState(false)
  const [maxStates, setMaxStates] = useState(250000)
  const [maxSeconds, setMaxSeconds] = useState(30)
  const waypoints = waypointInput.trim().toUpperCase().split(/[\s,]+/).filter(Boolean)
  const [maxSteps, setMaxSteps] = useState(5)
  const [notice, setNotice] = useState('')
  const [options, setOptions] = useState<LadderOptions>({ addDelete: false, rearrange: 'off', move: false })
  const waypointError = mode !== 'ordered' ? '' : waypoints.length < 3 ? 'Enter at least three words.' : new Set(waypoints).size !== waypoints.length ? 'Use distinct words; the entire route must have no repeats.' : waypoints.some(word => !/^[A-Z]+$/.test(word)) ? 'Use letters A–Z, separating words with spaces, commas, or new lines.' : lexicon && waypoints.some(word => !lexicon.has(word)) ? `Not in the dictionary: ${waypoints.filter(word => !lexicon.has(word)).join(', ')}` : !options.addDelete && waypoints.some(word => word.length !== waypoints[0].length) ? 'Use words of the same length, or enable adding/deleting a letter.' : ''
  const worker = useRef<Worker | null>(null)
  const activeWords = mode === 'ordered' ? [] : mode === 'explore' ? words.slice(0, 1) : words
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
    setRoutePage(0)
    stop()
    setWords(next)
    setResult(null)
    setExploration(null)
    setNotice('')
  }

  function search() {
    setRoutePage(0)
    setTouched([true, true])
    setWaypointsTouched(true)
    if (!lexicon || errors.some(Boolean) || lengthError || waypointError) return
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
      const start = mode === 'ordered' ? waypoints[0] : words[0]
      active.postMessage({ start, end: words[1], words: [...lexicon].filter(word => options.addDelete || word.length === start.length), options, mode, maxSteps, waypoints, maxStates, maxMs: maxSeconds * 1000 } satisfies LadderRequest)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start the search.')
      stop()
    }
  }

  return (
    <main className="page-shell ladder-page">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href={import.meta.env.BASE_URL}><img className="brand-mark" src={`${import.meta.env.BASE_URL}word-ladder-icon.svg`} width="44" height="44" alt="" /><span>Word ladder <em>solver</em></span></a>
        <div className="page-links"><a href={import.meta.env.BASE_URL}>Pandergrams</a><a href={`${import.meta.env.BASE_URL}word-ladder.html`} aria-current="page">Word ladder</a></div>
      </nav>
      <section className="workspace word-panel" aria-labelledby="ladder-heading">
        <p className="eyebrow">One step at a time</p>
        <h1 id="ladder-heading">Word ladder</h1>
        <p className="helper">Connect two words in the fewest steps. Replacing exactly one letter is always allowed. Enable extra moves below to explore more connections. Every step must form a valid dictionary word.</p>
        <p className="dictionary-note"><a href="https://norvig.com/ngrams/word.list" target="_blank" rel="noreferrer">{dictionary.source}</a> · {lexicon ? `${lexicon.size.toLocaleString()} words loaded` : dictionaryError ? 'Unavailable' : 'Loading…'}</p>
        {dictionaryError && <p role="alert" className="field-error">{dictionaryError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
        <form onSubmit={event => { event.preventDefault(); search() }}>
          <fieldset className="ladder-options">
            <legend>Search mode</legend>
            <label className="ladder-toggle"><input type="radio" name="ladder-mode" checked={mode === 'target'} onChange={() => { edit(words); setMode('target') }} /> Connect two words</label>
            <label className="ladder-toggle"><input type="radio" name="ladder-mode" checked={mode === 'explore'} onChange={() => { edit(words); setMode('explore') }} /> Explore all words from a starting word</label>
            <label className="ladder-toggle"><input type="radio" name="ladder-mode" checked={mode === 'ordered'} onChange={() => { edit(words); setMode('ordered') }} /> Visit multiple words in order</label>
            {mode === 'explore' && <><label htmlFor="ladder-depth">Maximum steps</label><select id="ladder-depth" value={maxSteps} onChange={event => { edit(words); setMaxSteps(Number(event.target.value)) }}>{[1, 2, 3, 4, 5].map(depth => <option key={depth} value={depth}>{depth} {depth === 1 ? 'step' : 'steps'}</option>)}</select><p>Find every reachable word and every shortest path within this limit. Paths never repeat a word. Results are grouped by minimum step count.</p></>}
          </fieldset>
          {mode === 'ordered' && <div className="ordered-words">
            <label htmlFor="ordered-words">Words to visit, in order</label>
            <p id="ordered-help">Enter at least three distinct words, separated by spaces, commas, or new lines. The route starts at the first word and ends at the last. Intermediate dictionary words are allowed, but no word can appear twice and later requested words cannot be visited early.</p>
            <textarea id="ordered-words" rows={4} value={waypointInput} placeholder="COLD, CORD, CARD, WARD, WARM" spellCheck={false} aria-invalid={waypointsTouched && !!waypointError} aria-describedby="ordered-help ordered-error" onBlur={() => setWaypointsTouched(true)} onChange={event => { edit(words); setWaypointInput(event.target.value.toUpperCase()); setWaypointsTouched(true) }} />
            <p id="ordered-error" className="field-error">{waypointsTouched ? waypointError : ''}</p>
            <fieldset className="ladder-options"><legend>Ordered search limits</legend>
              <label htmlFor="ordered-states">Maximum states</label><select id="ordered-states" value={maxStates} onChange={event => { edit(words); setMaxStates(Number(event.target.value)) }}>{[50000, 250000, 1000000].map(value => <option key={value} value={value}>{value.toLocaleString()}</option>)}</select>
              <label htmlFor="ordered-seconds">Time limit</label><select id="ordered-seconds" value={maxSeconds} onChange={event => { edit(words); setMaxSeconds(Number(event.target.value)) }}>{[10, 30, 60, 120].map(value => <option key={value} value={value}>{value} seconds</option>)}</select>
              <p>Long routes can require many searches. A reached limit is inconclusive, not proof that a route is impossible.</p>
            </fieldset>
          </div>}
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
              <option value="swap">Swap two letters</option>
              <option value="permute">Permute entire word</option>
            </select>
            <label className="ladder-toggle"><input type="checkbox" checked={!!options.move} onChange={event => { edit(words); setOptions({ ...options, move: event.target.checked }) }} /> Move one letter to another position</label>
            <p>Moving a letter keeps all other letters in their relative order. Permutation allows any rearrangement of the same letters.</p>
          </fieldset>
          <div className="search-actions">
            <button className="primary-button" type="submit" disabled={!lexicon || running}>{running ? 'Searching…' : mode === 'explore' ? 'Find all reachable words' : mode === 'ordered' ? 'Find all shortest ordered routes' : 'Find shortest ladder'}</button>
            <button type="button" onClick={() => { edit(['', '']); setTouched([false, false]); setWaypointInput(''); setWaypointsTouched(false) }}>Clear input</button>
            {running && <button type="button" onClick={() => { stop(); setNotice('Search cancelled. No conclusion was reached.') }}>Cancel</button>}
          </div>
        </form>
      </section>
      <section className="results-panel" aria-labelledby="ladder-results-heading" aria-busy={running}>
        {mode === 'explore' ? <>
          <div role="status"><h2 id="ladder-results-heading">{running ? 'Exploring all shortest paths…' : exploration ? 'Reachable words and shortest paths' : 'Explore from your starting word'}</h2><p>{notice || (running ? 'Searching every reachable word within your step limit.' : exploration ? 'Search complete. All reachable words and shortest paths are available below.' : 'Enter a starting word and choose a step limit from 1 to 5.')}</p></div>
          {exploration && <LadderExploration result={exploration} />}
        </> : <><div role="status">
          <h2 id="ladder-results-heading">{running ? 'Finding your ladder…' : result?.path ? `Shortest ladder: ${result.path.length - 1} ${result.path.length === 2 ? 'step' : 'steps'}` : result?.limited ? 'Search limit reached' : result ? 'No ladder found' : 'Your shortest ladder'}</h2>
          {notice ? <p>{notice}</p> : running ? <p>Searching for a shortest complete route.</p> : result?.limited ? <p>{result.reason}</p> : result?.path ? <p>{mode === 'ordered' ? 'All requested words are visited in order. No word repeats anywhere in this shortest route.' : result.path.length === 1 ? 'The starting and ending words are identical. No changes needed.' : 'One shortest path under your selected rules is shown below. Each step describes the operation used.'}</p> : result ? <p>{mode === 'ordered' ? 'No route visits all requested words in order without repeating a word under the selected rules.' : 'No sequence of enabled moves connects these words in the bundled word list.'}</p> : <p>{mode === 'ordered' ? 'Enter three or more words in order, then find a route through them.' : 'Enter two words, choose your move rules, then find their shortest connection.'}</p>}
        </div>
        {mode === 'ordered' && result?.routes && result.routes.length > 0 && <div>
          <p>{result.complete ? `All ${result.routes.length.toLocaleString()} shortest routes found.` : `${result.routes.length.toLocaleString()} shortest routes found so far; more may exist.`} No word repeats within any route.</p>
          <p>Showing routes {routePage * 10 + 1}–{Math.min((routePage + 1) * 10, result.routes.length)} of {result.routes.length.toLocaleString()}.</p>
          <ol className="ordered-route-list" start={routePage * 10 + 1}>{result.routes.slice(routePage * 10, (routePage + 1) * 10).map(route => <li key={route.path.join(',')}><p>{route.path.join(' → ')}</p><details><summary>Step details</summary><ol>{route.moves.map((move, index) => <li key={index}>{route.path[index]} → {route.path[index + 1]}: {move.description}</li>)}</ol></details></li>)}</ol>
          {result.routes.length > 10 && <div className="search-actions"><button disabled={routePage === 0} onClick={() => setRoutePage(routePage - 1)}>Previous routes</button><button disabled={(routePage + 1) * 10 >= result.routes!.length} onClick={() => setRoutePage(routePage + 1)}>Next routes</button></div>}
        </div>}
        {mode !== 'ordered' && result?.path && <ol className="ladder-path" aria-label="Shortest word ladder">{result.path.map((word, index, path) => <li key={word}><span className="ladder-step">{index === 0 ? 'Start' : `Step ${index}`}</span><div className="ladder-transition"><span className="ladder-word">{[...word].map((letter, position) => index > 0 && result.moves[index - 1].positions.includes(position) ? <mark className="changed-letter" key={position}>{letter}</mark> : <span key={position}>{letter}</span>)}</span>{index > 0 && <p className="ladder-operation">{result.moves[index - 1].description}</p>}</div>{index === path.length - 1 && <span className="count-pill">Finish</span>}</li>)}</ol>}
        {mode === 'ordered' && result?.path && <p>Requested order: {waypoints.join(' → ')}</p>}
        {result && <p className="search-stats">{result.explored.toLocaleString()} {mode === 'ordered' ? 'route states' : 'words'} explored · Exact breadth-first search</p>}
        </>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><WordLadder /></StrictMode>)
