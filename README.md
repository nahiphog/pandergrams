# Pandergram Solver

A React/TypeScript app that searches for the fewest single-letter substitutions
needed for a word bank to cover A–Z simultaneously.

## Run

Use Node.js 24 or newer (the tests use native TypeScript support).

```sh
npm install
npm run dev
npm test
npm run build
```

The five starting word boxes are empty on load. Fill them, then select
**Find minimum changes**, immediately to the left of **Clear input**.
The bank always has exactly five boxes; Clear input empties them without removing any.
Every word must appear in the bundled [Norvig dictionary](https://norvig.com/ngrams/word.list).
Input is normalized to uppercase. Substitutions preserve word lengths; duplicate
words are allowed. Editing or resetting inputs cancels the current search and
clears its result. Cancel also immediately terminates the search worker.

The optional **Excluded words** field accepts comma-separated words, ignoring
case, surrounding spaces, duplicates, and empty entries. Excluded words cannot
be mutation destinations, including final mutations; starting words remain
allowed. Editing the list cancels and clears the current search. Clear the field
to remove exclusions; the list is not persisted. A* still finds the fewest moves
among solutions permitted by the exclusions.

For a six-move example, enter these five words:
`MOBILIZES PRETESTING VERTEX HALLWAY SQUEALING`.

## Search behavior

`src/solver.ts` performs exact A* over ordered complete word banks. A binary
min-heap prioritizes `f = g + h`, where `g` is the moves taken and `h` is the
number of missing alphabet letters. Each substitution can introduce at most one
missing letter, so this heuristic is admissible and consistent. Equal priorities
favor fewer missing letters, with insertion order as the final tie-breaker.

The solver tracks the best move count for each entire bank, accepting a cheaper
route even if that bank was already discovered. Superseded heap entries are
skipped. A goal is accepted only when popped from the minimum-priority frontier,
preserving the fewest-moves guarantee. A word can occur in many different bank
states. Cached neighbors and letter masks speed up expansion; immutable parent
links reconstruct the solution without changing earlier paths.

Coverage is calculated from the current bank, not accumulated across moves.
Moves that temporarily lose coverage remain eligible. No history-based letter
restriction is necessary: same-position detours cannot improve a shortest path.

`src/solver.worker.ts` runs A* off the UI thread. Request IDs prevent stale
messages from replacing newer results. The UI validates words against the same
dictionary passed to the worker.

Search defaults to 250,000 discovered states or 30 seconds. Both limits can be
selected in the Search limits dropdowns before running a search. State options
are 50,000, 100,000, 250,000, 500,000, 1,000,000, and 2,000,000. Time options
are 10 seconds, 30 seconds, 1 minute, 2 minutes, 5 minutes, and 10 minutes.
The time budget includes collecting optimal
walkthroughs. Editing limits cancels and clears an active search. Restore default
limits resets both settings; Clear input preserves the selected search limits.
Larger state limits require more browser memory. The separate 10,000-walkthrough
collection limit still applies. A reached limit is an
incomplete search, never a proof of impossibility. The original five-word example
has a minimum solution of nine moves; A* finds it within the state limit.
These limits can be adjusted through the solver options; memory still grows
rapidly with the number of word-bank
combinations. An already complete bank returns zero moves. Fewer than 26 total
letter positions is rejected as impossible; otherwise, no solution is reported
only after exhaustive search.

## Validation

The Node test suite checks shortest paths, reconstruction, full-bank state
tracking, temporary coverage loss, cycles, invalid inputs, resource limits,
progress, and a real-dictionary solution. It also compares A* with an independent
exhaustive BFS oracle on 100 deterministic generated word graphs. `npm run build`
checks TypeScript and bundles the application and worker.

## Deployment

The site is published at https://nahiphog.github.io/pandergrams/.
`.github/workflows/deploy.yml` installs the locked dependencies with `npm ci`,
runs the tests, builds with Node 24, and deploys `dist` using GitHub Pages Actions.
Pushes to `main` deploy automatically; the workflow can also be run manually.
Production assets and the dictionary use the `/pandergrams/` base path; local
development uses `/`. No additional deployment package or secret is needed.

## Multiple optimal walkthroughs

A* retains equal-cost predecessor edges and continues through every state whose
estimated total cost is at most the optimum. The results include distinct
per-word mutation chains in starting row order. Interleavings of independent row
mutations are shown once. Results are displayed ten at a time with Show more.
The UI explicitly labels incomplete results if the state/time limit or the
10,000-walkthrough collection limit is reached; it never calls a partial set all
solutions. Every returned solution still has the proven minimum move count.

Excluded words convert to uppercase as you type. Clear input empties all current
word boxes and exclusions, cancels any running search, and clears all results.
