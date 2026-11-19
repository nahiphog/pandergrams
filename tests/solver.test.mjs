import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solve, letterMask, FULL_ALPHABET, missingLetterCount, WordSearchCache } from '../src/solver.ts'

const filler = 'DEFGHIJKLMNOPQRSTUVWXYZ'
const dict = (...words) => new Set([filler, ...words])
function verify(start, dictionary, expectedMoves) {
  const result = solve(start, dictionary)
  assert.equal(result.status, 'solved')
  assert.equal(result.moves.length, expectedMoves)
  const bank = [...start]
  for (const move of result.moves) {
    assert.equal(bank[move.row], move.from)
    assert.ok(dictionary.has(move.to))
    assert.equal(move.from.length, move.to.length)
    assert.deepEqual([...move.from].flatMap((letter, i) => letter !== move.to[i] ? [i] : []), [move.position])
    bank[move.row] = move.to
  }
  assert.deepEqual(bank, result.words)
  assert.equal(bank.reduce((mask, word) => mask | letterMask(word), 0), FULL_ALPHABET)
  return result
}

test('already complete bank takes zero moves', () => verify(['ABC', filler], dict('ABC'), 0))
test('Factorized solver returns minimum path and valid reconstruction', () => verify(['AAA', filler], dict('AAA', 'ABA', 'ABC', 'ADA', 'ADB', 'ABB'), 2))
test('independent rows preserve distinct assignments even for duplicate starting words', () => verify(['AAA', 'AAA', filler], dict('AAA', 'BAA', 'CAA'), 2))
test('same-position detour loses to the direct substitution', () => {
  const support = 'BCDEFGHIJMNOPQRTUVWXYZ'
  const result = verify(['BLACK', support], new Set(['BLACK', 'PLACK', 'SLACK', support]), 1)
  assert.equal(result.moves[0].to, 'SLACK')
})
test('temporary coverage loss is allowed', () => verify(['AAA', filler], dict('AAA', 'AAD', 'ADD', 'BDD', 'BCD', 'BCA'), 5))
test('cycles terminate with an exhaustive no-solution result', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'ABB', 'AAB'))
  assert.equal(result.status, 'impossible')
  assert.equal(result.discovered, 5) // Four reachable three-letter words plus the fixed support word.
})
test('fewer than 26 positions is impossible', () => assert.equal(solve(['AAA'], dict('AAA')).status, 'impossible'))
test('invalid inputs fail validation', () => {
  for (const words of [[], ['NOPE'], ['abc'], ['A-B'], ['']]) assert.throws(() => solve(words, dict('ABC')))
})
test('state limits do not claim impossibility', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'ABC'), { maxStates: 1 })
  assert.equal(result.status, 'limited')
  assert.equal(result.discovered, 1)
})
test('time limits do not claim impossibility', () => {
  let tick = 0
  assert.equal(solve(['AAA', filler], dict('AAA', 'ABA'), { maxMs: 1, now: () => tick++ }).status, 'limited')
})
test('progress reports include complete state counts', () => {
  let tick = 0
  const progress = []
  solve(['AAA', filler], dict('AAA', 'ABA', 'ABC'), { now: () => tick += 160, onProgress: (value) => progress.push(value) })
  assert.ok(progress.length)
  assert.ok(progress.every((value) => value.discovered >= value.explored))
})
test('bundled dictionary supports a real one-move pangram solution', () => {
  const dictionary = new Set(readFileSync(new URL('../public/norvig-word-list.txt', import.meta.url), 'utf8').split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean))
  verify(['THE', 'QUICK', 'BROWN', 'FOX', 'JUMPS', 'OVER', 'THE', 'HAZY', 'DOG'], dictionary, 1)
})


// Deliberately simple independent FIFO oracle: no heap, heuristic, or neighbor cache.
function bfsDistance(start, dictionary) {
  const queue = [[start, 0]]
  const seen = new Set([start.join('|')])
  for (let head = 0; head < queue.length; head++) {
    const [bank, distance] = queue[head]
    if (new Set(bank.join('')).size === 26) return distance
    for (let row = 0; row < bank.length; row++) {
      for (const candidate of dictionary) {
        if (candidate.length !== bank[row].length) continue
        if ([...candidate].filter((letter, i) => letter !== bank[row][i]).length !== 1) continue
        const next = [...bank]
        next[row] = candidate
        const key = next.join('|')
        if (!seen.has(key)) {
          seen.add(key)
          queue.push([next, distance + 1])
        }
      }
    }
  }
  return null
}

test('missing-letter heuristic counts distinct uncovered letters', () => {
  assert.equal(missingLetterCount(0), 26)
  assert.equal(missingLetterCount(FULL_ALPHABET), 0)
  assert.equal(missingLetterCount(letterMask('AAAABC')), 23)
})

test('Factorized solver agrees with independent exhaustive BFS on 100 seeded word graphs', () => {
  let seed = 74129
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const candidates = []
  for (const a of 'ABCDE') for (const b of 'ABCDE') for (const c of 'ABCDE') candidates.push(a + b + c)
  const support = 'EFGHIJKLMNOPQRSTUVWXYZ'
  let solved = 0, impossible = 0
  for (let sample = 0; sample < 100; sample++) {
    const selected = candidates.filter(() => random() < 0.18)
    const dictionary = new Set([support, ...selected, 'AAA', 'EEE'])
    const start = ['AAA', 'EEE', support]
    const expected = bfsDistance(start, dictionary)
    if (expected === null) {
      assert.equal(solve(start, dictionary).status, 'impossible', `sample ${sample}`)
      impossible++
    } else {
      verify(start, dictionary, expected)
      solved++
    }
  }
  assert.ok(solved > 0 && impossible > 0)
})

test('excluded intermediate words force the shortest permitted alternative', () => {
  const dictionary = dict('AAA', 'ABA', 'ABC', 'DAA', 'DAB', 'DCB', 'ACB')
  assert.equal(solve(['AAA', filler], dictionary).moves.length, 2)
  const result = solve(['AAA', filler], dictionary, { excludedWords: [' aba ', 'aBa', '', 'UNKNOWN'] })
  assert.equal(result.status, 'solved')
  assert.equal(result.moves.length, 4)
  assert.ok(result.moves.every(move => move.to !== 'ABA'))
  assert.equal(solve(['AAA', filler], dictionary).moves.length, 2, 'exclusions do not persist between searches')
  assert.ok(dictionary.has('ABA'), 'dictionary is not modified')
})
test('excluding the only goal produces an exhaustive no-solution result', () => {
  assert.equal(solve(['AAA', filler], dict('AAA', 'ABA', 'ABC'), { excludedWords: ['ABC'] }).status, 'impossible')
})
test('excluded starting words remain allowed and can mutate away', () => {
  const dictionary = dict('AAA', 'ABA', 'ABC')
  const result = solve(['AAA', filler], dictionary, { excludedWords: ['AAA', filler] })
  assert.equal(result.status, 'solved')
  assert.equal(result.moves.length, 2)
  assert.equal(solve(['ABC', filler], dictionary, { excludedWords: ['ABC'] }).moves.length, 0)
})

test('collects different shortest paths to the same final word bank', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'AAC', 'ABC'))
  assert.equal(result.complete, true)
  assert.deepEqual(new Set(result.solutions.map(s => s.moves.map(m => m.to).join(','))), new Set(['ABA,ABC', 'AAC,ABC']))
})
test('collects all optimal goal banks and keeps unchanged rows', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'AAC', 'ABC', 'ACA', 'ACB'))
  assert.equal(result.complete, true)
  assert.equal(result.solutions.length, 3)
  for (const solution of result.solutions) {
    assert.equal(solution.moves.length, 2)
    assert.equal(solution.words[1], filler)
  }
})
test('deduplicates only interleavings, preserving distinct row assignments', () => {
  const result = solve(['AAA', 'AAA', filler], dict('AAA', 'BAA', 'CAA'))
  assert.equal(result.complete, true)
  assert.equal(result.solutions.length, 2)
  assert.deepEqual(new Set(result.solutions.map(s => s.words.join(','))), new Set([['BAA','CAA',filler].join(','), ['CAA','BAA',filler].join(',')]))
})
test('result limits preserve an optimal solution and explicitly report incompleteness', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'AAC', 'ABC'), { maxSolutions: 1 })
  assert.equal(result.status, 'solved')
  assert.equal(result.moves.length, 2)
  assert.equal(result.solutions.length, 1)
  assert.equal(result.complete, false)
  assert.match(result.reason, /Result limit/)
})
test('complete starting bank has exactly one zero-move walkthrough', () => {
  const result = solve(['ABC', filler], dict('ABC'))
  assert.equal(result.complete, true)
  assert.equal(result.solutions.length, 1)
  assert.deepEqual(result.solutions[0].moves, [])
})

test('all walkthroughs match exhaustive path enumeration on small word graphs', () => {
  const candidates = []
  for (const a of 'ABC') for (const b of 'ABC') for (const c of 'ABC') candidates.push(a+b+c)
  let seed = 13
  for (let sample = 0; sample < 40; sample++) {
    const dictionary = dict('AAA', ...candidates.filter(() => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed / 2**32 < .3 }))
    const start = ['AAA', filler]
    const distance = bfsDistance(start, dictionary)
    const result = solve(start, dictionary)
    if (distance === null) { assert.equal(result.status, 'impossible'); continue }
    const expected = new Set()
    const visit = (word, path) => {
      if (path.length === distance) {
        if (new Set(word+filler).size === 26) expected.add(path.join(','))
        return
      }
      for (const next of dictionary) if (next.length === word.length && [...word].filter((letter,i) => letter !== next[i]).length === 1) visit(next, [...path,next])
    }
    visit('AAA',[])
    assert.equal(result.complete,true)
    assert.deepEqual(new Set(result.solutions.map(s=>s.moves.map(m=>m.to).join(','))),expected)
  }
})

test('raising the state limit allows all optimal walkthroughs to be collected', () => {
  const dictionary = dict('AAA', 'ABA', 'AAC', 'ABC')
  assert.equal(solve(['AAA', filler], dictionary, { maxStates: 1 }).status, 'limited')
  const result = solve(['AAA', filler], dictionary, { maxStates: 100 })
  assert.equal(result.complete, true)
  assert.equal(result.solutions.length, 2)
})
test('raising the time limit allows the same search to complete', () => {
  const run = maxMs => {
    let tick = 0
    return solve(['AAA', filler], dict('AAA', 'ABA', 'AAC', 'ABC'), { maxMs, now: () => tick++ })
  }
  assert.equal(run(1).status, 'limited')
  assert.equal(run(10000).complete, true)
  assert.equal(run(10000).solutions.length, 2)
})
test('invalid search limits cannot bypass resource checks', () => {
  for (const name of ['maxStates', 'maxMs']) {
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => solve(['AAA', filler], dict('AAA'), { [name]: value }), /Search limits/)
    }
  }
})

test('all multi-row walkthroughs agree with exhaustive row-ordered paths', () => {
  let seed = 773
  const candidates = []
  for (const a of 'ABC') for (const b of 'ABC') for (const c of 'ABC') candidates.push(a+b+c)
  for (let sample = 0; sample < 30; sample++) {
    const dictionary = dict('AAA', ...candidates.filter(() => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/2**32 < .2 }))
    const start=['AAA','AAA',filler], distance=bfsDistance(start,dictionary), result=solve(start,dictionary)
    if(distance===null) { assert.equal(result.status,'impossible');continue }
    assert.equal(result.complete,true)
    const expected=new Set()
    const visit=(bank,moves,minRow) => {
      if(moves.length===distance) {
        if(new Set(bank.join('')).size===26) expected.add(JSON.stringify(moves))
        return
      }
      for(let row=minRow;row<2;row++) for(const candidate of dictionary) {
        if(candidate.length!==bank[row].length || [...candidate].filter((c,i)=>c!==bank[row][i]).length!==1) continue
        const next=[...bank];next[row]=candidate
        visit(next,[...moves,[row,candidate]],row)
      }
    }
    visit(start,[],0)
    assert.deepEqual(new Set(result.solutions.map(s=>JSON.stringify(s.moves.map(m=>[m.row,m.to])))),expected)
  }
})
test('equal coverage and distance retain different final words', () => {
  const result=solve(['AAA',filler],dict('AAA','ABA','ABC','ACA','ACB'))
  assert.equal(result.complete,true)
  assert.deepEqual(new Set(result.solutions.map(s=>s.words[0])),new Set(['ABC','ACB']))
})
test('reachable-letter pruning proves an unavailable letter impossible', () => {
  const result=solve(['AAA',filler],dict('AAA','ABA','ABB'))
  assert.equal(result.status,'impossible')
  assert.match(result.reason,/cannot be reached/)
})
test('coverage alone does not falsely prove feasibility', () => {
  // All A/B/C occur somewhere, but this row only has two positions.
  const support='DEFGHIJKLMNOPQRSTUVWXYZDDD'
  const dictionary=new Set(['AA','AB','AC',support])
  const result=solve(['AA',support],dictionary)
  assert.equal(result.status,'impossible')
  assert.match(result.reason,/No combination/)
})
test('no implicit eight-mutation constraint is introduced', () => {
  const support='BCDEFGHIJKLMNOPQRSTUVWXYZ'
  const path=['ZZZZZZZZZZ','BZZZZZZZZZ','BBZZZZZZZZ','BBBZZZZZZZ','BBBBZZZZZZ','BBBBBZZZZZ','BBBBBBZZZZ','BBBBBBBZZZ','BBBBBBBBZZ','BBBBBBBBBZ','BBBBBBBBBA']
  const result=solve([path[0],support],new Set([...path,support]))
  assert.equal(result.status,'solved')
  assert.equal(result.moves.length,10)
  assert.equal(result.complete,true)
})

test('collection timeout retains a proven optimum and reports missing alternatives', () => {
  let clock=0
  const result=solve(['AAA',filler],dict('AAA','ABA','AAC','ABC'),{
    maxMs:100000,
    now:()=>clock+=200,
    onProgress:progress=>{ if(progress.phase==='solutions') clock=100000 }
  })
  assert.equal(result.status,'solved')
  assert.equal(result.moves.length,2)
  assert.equal(result.complete,false)
  assert.match(result.reason,/Time limit/)
})
test('all returned alternative chains are valid and have minimum total cost', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC','ACA','ACB','BAA','CAA')
  const start=['AAA','AAA',filler], expected=bfsDistance(start,dictionary)
  const result=solve(start,dictionary)
  for(const solution of result.solutions) {
    const bank=[...start]
    assert.equal(solution.moves.length,expected)
    for(const move of solution.moves) {
      assert.equal(move.from,bank[move.row])
      assert.equal([...move.from].filter((c,i)=>c!==move.to[i]).length,1)
      assert.ok(dictionary.has(move.to))
      bank[move.row]=move.to
    }
    assert.deepEqual(bank,solution.words)
    assert.equal(new Set(bank.join('')).size,26)
  }
})

test('repeated searches reuse complete word graphs without changing all solutions', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'), cache=new WordSearchCache()
  const cold=solve(['AAA',filler],dictionary,{cache})
  const warm=solve(['AAA',filler],dictionary,{cache})
  assert.equal(cold.cachedWordSearches,0)
  assert.equal(warm.cachedWordSearches,2)
  assert.deepEqual(warm.solutions,cold.solutions)
  assert.equal(warm.complete,true)
  assert.equal(warm.discovered,cold.discovered)
  assert.ok(warm.explored<cold.explored)
})
test('exclusion keys normalize case, whitespace, ordering, and duplicates', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'), cache=new WordSearchCache()
  const cold=solve(['AAA',filler],dictionary,{cache,excludedWords:[' aba ','UNKNOWN']})
  const warm=solve(['AAA',filler],dictionary,{cache,excludedWords:['unknown','ABA','aba','']})
  assert.equal(warm.cachedWordSearches,2)
  assert.deepEqual(warm.solutions,cold.solutions)
  const changed=solve(['AAA',filler],dictionary,{cache,excludedWords:['AAC']})
  assert.equal(changed.cachedWordSearches,0)
  assert.ok(changed.solutions.every(s=>s.moves.every(m=>m.to!=='AAC')))
  assert.equal(solve(['AAA',filler],dictionary,{cache,excludedWords:['ABA','UNKNOWN']}).cachedWordSearches,2)
})
test('dictionary content changes invalidate cache, including same-size mutations', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'), cache=new WordSearchCache()
  solve(['AAA',filler],dictionary,{cache})
  assert.equal(solve(['AAA',filler],new Set(dictionary),{cache}).cachedWordSearches,2)
  dictionary.delete('ABA');dictionary.add('ACA')
  const changed=solve(['AAA',filler],dictionary,{cache})
  assert.equal(changed.cachedWordSearches,0)
  assert.deepEqual(changed.solutions,solve(['AAA',filler],dictionary).solutions)
})
test('partial BFS graphs are never reused after a state-limit stop', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'),cache=new WordSearchCache()
  assert.equal(solve(['AAA',filler],dictionary,{cache,maxStates:2}).status,'limited')
  const retry=solve(['AAA',filler],dictionary,{cache})
  assert.equal(retry.cachedWordSearches,0)
  assert.equal(retry.solutions.length,2)
})
test('complete earlier graphs survive a later word-search limit', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'),cache=new WordSearchCache()
  assert.equal(solve([filler,'AAA'],dictionary,{cache,maxStates:2}).status,'limited')
  const retry=solve([filler,'AAA'],dictionary,{cache})
  assert.equal(retry.cachedWordSearches,1)
  assert.equal(retry.complete,true)
})
test('cached graphs continue to respect smaller state limits', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'),cache=new WordSearchCache()
  solve(['AAA',filler],dictionary,{cache})
  const result=solve(['AAA',filler],dictionary,{cache,maxStates:1})
  assert.equal(result.status,'limited')
  assert.ok(result.discovered<=1)
})
test('cached starting words can be reused in different row positions', () => {
  const dictionary=dict('AAA','ABA','AAC','ABC'),cache=new WordSearchCache()
  solve(['AAA',filler],dictionary,{cache})
  const result=solve([filler,'AAA'],dictionary,{cache})
  assert.equal(result.cachedWordSearches,2)
  assert.ok(result.solutions.every(s=>s.moves.every(move=>move.row===1)))
})
test('cache evicts least recently used entries and skips oversized graphs', () => {
  const a='B'.repeat(26),b='C'.repeat(26),c='D'.repeat(26),dictionary=new Set([a,b,c]),cache=new WordSearchCache(2,10)
  solve([a],dictionary,{cache});solve([b],dictionary,{cache})
  assert.equal(solve([a],dictionary,{cache}).cachedWordSearches,1)
  solve([c],dictionary,{cache})
  assert.equal(solve([b],dictionary,{cache}).cachedWordSearches,0)
  const tiny=new WordSearchCache(32,1), words=dict('AAA','ABA','AAC','ABC')
  solve(['AAA',filler],words,{cache:tiny})
  assert.equal(solve(['AAA',filler],words,{cache:tiny}).cachedWordSearches,1)
})
