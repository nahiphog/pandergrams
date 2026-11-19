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
to remove exclusions; the list is not persisted. The solver still finds the fewest moves
among solutions permitted by the exclusions.

For a six-move example, enter these five words:
`MOBILIZES PRETESTING VERTEX HALLWAY SQUEALING`.

## Word ladder page

Open **Word ladder** in the navigation (or `word-ladder.html`) to connect a
starting word to an ending word using the same bundled Norvig dictionary.
Both words must be in the list and have equal length. Each move replaces exactly
one letter; adding, deleting, and rearranging letters are not allowed.

The separate worker runs exhaustive breadth-first search and returns one shortest
path with its change count and each changed letter highlighted. Identical words
take zero changes; disconnected words produce a no-ladder result only after the
reachable words are exhausted. Editing or clearing inputs cancels and clears the
search. Cancel stops the worker without claiming no solution exists.
The production build includes both HTML pages for direct links on GitHub Pages.

## Pandergram search behavior

The solver separates the problem into independent word searches and an exact
minimum-cost coverage search:

1. Run BFS from each starting word, keeping every shortest predecessor edge.
   Excluded words cannot be mutation destinations. Neighbor lists are cached;
   duplicate starting rows share a graph within the search.
2. Check whether the union of reachable letters can cover A–Z. If not, return
   a proven impossible result immediately.
3. Remove letters guaranteed by at least one row from the coverage calculation.
   Group endpoints by the remaining letter mask, retaining the cheapest distance
   and every tied endpoint. A more expensive endpoint with the same mask cannot
   belong to a global optimum.
4. Use dynamic programming over rows and coverage masks to minimize the sum of
   word distances. Process smaller candidate groups first. Prune coverage that
   remaining rows cannot complete, and costs above an established feasible bound.
   Retain all equal-cost predecessor choices.
5. Reconstruct all tied endpoint combinations and every shortest word chain,
   restoring the original row order. Interleavings of independent row mutations
   produce the same walkthrough and are shown once.

This is exact because there are no cross-row constraints during mutation: any
combination of independent valid chains can be performed in sequence. Coverage
is required only in the final bank. There is no eight-mutation cap.

The worker reports three phases: reachable words, coverage combinations, and
solution collection. States count unique word-graph nodes (shared duplicate
roots counted once) plus coverage-mask nodes at each DP layer. Limits cover the
whole search; a limit before the optimum is proven returns an incomplete search,
not a claim of impossibility. After proof, collection limits preserve the first
optimal walkthrough and explicitly mark the alternatives incomplete.

Full word-graph exploration can be slower than the previous A* on easy puzzles,
but avoids the product of intermediate word states. For the original example,
a local comparison reduced discovered states from 149,668 to 29,781. With
PROTECTING excluded from the six-move example, the new solver proves impossibility
where the old solver hit its 250,000-state limit.

The solver worker keeps the calculation off the UI thread. Request IDs reject
stale responses, and termination supports cancellation.

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
has a minimum solution of nine moves, found within the default state limit.
These limits can be adjusted through the solver options; memory still grows
rapidly with the number of word-bank
combinations. An already complete bank returns zero moves. Fewer than 26 total
letter positions is rejected as impossible; otherwise, no solution is reported
only after exhaustive search.

## Validation

The Node test suite checks shortest paths, reconstruction, full-bank state
tracking, temporary coverage loss, cycles, invalid inputs, resource limits,
progress, and a real-dictionary solution. It also compares the solver with an independent
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

BFS and coverage DP retain every equal-cost predecessor needed to reconstruct
all minimum solutions. The results include distinct
per-word mutation chains in starting row order. Interleavings of independent row
mutations are shown once. Results are displayed ten at a time with Show more.
The UI explicitly labels incomplete results if the state/time limit or the
10,000-walkthrough collection limit is reached; it never calls a partial set all
solutions. Every returned solution still has the proven minimum move count.

Excluded words convert to uppercase as you type. Clear input empties all current
word boxes and exclusions, cancels any running search, and clears all results.

## Per-word search cache

Completed pandergram word searches stay in the page's idle worker for reuse.
The key includes the starting word and normalized, sorted exclusions; dictionary
content changes invalidate the cache. Reordering rows or changing search limits
can reuse the same graphs. Only fully explored word graphs are cached, including
ones completed before another part of a search reaches a limit.

An LRU policy bounds the cache to 32 graphs and 500,000 combined nodes and
predecessor edges. Larger graphs are not retained. Cached nodes still count
toward the selected state limit. Statistics show how many cached word searches
were reused; the coverage combination search and walkthrough collection run anew.

Editing or clearing inputs after a completed search keeps the cache. Cancelling
or editing during an active search terminates the worker immediately and discards
its cache. Reloading or leaving the page also clears it; nothing is saved to disk.
