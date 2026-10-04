import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { dictionary } from './dictionary'
import './styles.css'

const words = ['QUIZZES', 'BACKYARD', 'DAMPING', 'MOUTHFUL', 'VOWELS']
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const usedLetters = new Set(words.join('').toUpperCase().replace(/[^A-Z]/g, ''))
const missingLetters = alphabet.filter((letter) => !usedLetters.has(letter))

function App() {
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Pandergram Solver home">
          <span className="brand-mark">P</span>
          <span>Pandergram <em>Solver</em></span>
        </a>
        <span className="draft-chip"><span className="chip-dot" /> Puzzle draft</span>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow">Letter transformation puzzle</p>
        <h1>Make every letter <span>count.</span></h1>
        <p className="intro">Change one letter at a time. Build a word set that covers the entire alphabet in as few moves as possible.</p>
      </section>

      <section className="workspace" aria-label="Puzzle workspace">
        <div className="word-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Starting point</p>
              <h2>Current word bank</h2>
            </div>
            <span className="count-pill">{words.length} words</span>
          </div>
          <p className="helper">Your placeholder words are shown below. The solving controls will be added next.</p>
          <p className="dictionary-note">Dictionary staged: <a href={dictionary.path} target="_blank" rel="noreferrer">{dictionary.source}</a> · {dictionary.entries.toLocaleString()} entries</p>
          <div className="word-list">
            {words.map((word, index) => (
              <div className="word-row" key={word}>
                <span className="word-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="word-value" aria-label={word}>
                  {word.split('').map((letter, letterIndex) => (
                    <span className="letter-tile" key={`${word}-${letterIndex}`}>{letter}</span>
                  ))}
                </span>
                <span className="word-length">{word.length} letters</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="coverage-panel" aria-labelledby="coverage-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live coverage</p>
              <h2 id="coverage-heading">Alphabet check</h2>
            </div>
            <strong className="coverage-score">{usedLetters.size}<span>/26</span></strong>
          </div>
          <div className="progress-track" aria-label={`${usedLetters.size} of 26 letters covered`}>
            <span style={{ width: `${(usedLetters.size / alphabet.length) * 100}%` }} />
          </div>
          <div className="alphabet-grid" aria-label="Alphabet letter coverage">
            {alphabet.map((letter) => {
              const isUsed = usedLetters.has(letter)
              return <span className={isUsed ? 'letter used' : 'letter missing'} key={letter}>{letter}</span>
            })}
          </div>
          <div className="missing-callout">
            <span className="missing-icon">!</span>
            <div>
              <p>Still needed</p>
              <strong>{missingLetters.join(' · ')}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="next-step" aria-label="Next step">
        <span className="step-number">01</span>
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2>Set the rules for the first search.</h2>
        </div>
        <p>We’ve captured the initial word bank and its letter coverage. Tell us how you’d like the solver flow to work next.</p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
