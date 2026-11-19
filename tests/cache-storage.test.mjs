import test from 'node:test'
import assert from 'node:assert/strict'
import {solve,WordSearchCache} from '../src/solver.ts'
import {dictionaryFingerprint,encodeCache,decodeCache,loadWordCache,saveWordCache,MAX_CACHE_BYTES} from '../src/cache-storage.ts'

const filler='DEFGHIJKLMNOPQRSTUVWXYZ'
const dictionary=new Set(['AAA','ABA','AAC','ABC',filler])
const words=['AAA',filler]

async function savedFixture() {
  const cache=new WordSearchCache()
  const result=solve(words,dictionary,{cache})
  const fingerprint=await dictionaryFingerprint(dictionary)
  const stored=await encodeCache(fingerprint,cache.snapshot())
  return {result,cache,fingerprint,stored}
}

test('disk round trip restores complete graphs in a new cache with identical optimal paths',async()=>{
  const {result,fingerprint,stored}=await savedFixture()
  const fresh=new WordSearchCache()
  assert.equal(fresh.restore(dictionary,await decodeCache(fingerprint,structuredClone(stored))),2)
  const restored=solve(words,new Set(dictionary),{cache:fresh})
  assert.equal(restored.cachedWordSearches,2)
  assert.deepEqual(restored.solutions,result.solutions)
  assert.equal(restored.complete,true)
})
test('dictionary fingerprints ignore insertion order and detect content changes',async()=>{
  const fingerprint=await dictionaryFingerprint(dictionary)
  assert.equal(await dictionaryFingerprint(new Set([...dictionary].reverse())),fingerprint)
  const changed=new Set(dictionary);changed.delete('ABA');changed.add('ACA')
  assert.notEqual(await dictionaryFingerprint(changed),fingerprint)
  const {stored}=await savedFixture()
  assert.equal(await decodeCache(await dictionaryFingerprint(changed),stored),null)
})
test('old versions and damaged saved payloads are rejected',async()=>{
  const {fingerprint,stored}=await savedFixture()
  for(const damaged of [null,{}, {...stored,version:0}, {...stored,payload:stored.payload+' '}, {...stored,checksum:'wrong'}, {...stored,payload:'not JSON'}]) {
    assert.equal(await decodeCache(fingerprint,damaged),null)
  }
  const fresh=new WordSearchCache()
  assert.equal(fresh.restore(dictionary,{version:0,entries:[]}),0)
  assert.equal(fresh.restore(dictionary,null),0)
})
test('restoration skips malformed graph entries instead of poisoning searches',async()=>{
  const {cache}=await savedFixture()
  for(const damage of [
    graph=>{graph[0].mask=0},
    graph=>{graph[1].distance=99},
    graph=>{graph[1].parents=[{index:1,position:0}]},
    graph=>{graph[1].parents=[]},
    graph=>{graph[1].word='NOTINDICTIONARY'},
    graph=>{graph[1].parents[0].position=100}
  ]) {
    const snapshot=structuredClone(cache.snapshot());damage(snapshot.entries[0][1])
    const fresh=new WordSearchCache()
    assert.equal(fresh.restore(dictionary,snapshot),1)
    const result=solve(words,dictionary,{cache:fresh})
    assert.equal(result.cachedWordSearches,1)
    assert.equal(result.solutions.length,2)
  }
})
test('restored graphs retain exclusions and do not match different exclusions',async()=>{
  const cache=new WordSearchCache()
  solve(words,dictionary,{cache,excludedWords:['aba']})
  const fingerprint=await dictionaryFingerprint(dictionary)
  const fresh=new WordSearchCache()
  fresh.restore(dictionary,await decodeCache(fingerprint,await encodeCache(fingerprint,cache.snapshot())))
  const matching=solve(words,dictionary,{cache:fresh,excludedWords:[' ABA ','aba']})
  assert.equal(matching.cachedWordSearches,2)
  assert.ok(matching.moves.every(move=>move.to!=='ABA'))
  const changed=solve(words,dictionary,{cache:fresh,excludedWords:['AAC']})
  assert.equal(changed.cachedWordSearches,0)
  assert.ok(changed.moves.every(move=>move.to!=='AAC'))
})
test('serialization retains LRU order and restoration enforces cache bounds',async()=>{
  const {cache}=await savedFixture()
  const fresh=new WordSearchCache(1,500000)
  assert.equal(fresh.restore(dictionary,cache.snapshot()),1)
  assert.equal(fresh.snapshot().entries[0][0],cache.snapshot().entries.at(-1)[0])
  const tiny=new WordSearchCache(32,1)
  assert.equal(tiny.restore(dictionary,cache.snapshot()),1)
})
test('oversized disk snapshots retain recent entries within the byte budget',async()=>{
  const {cache,fingerprint}=await savedFixture()
  const snapshot=cache.snapshot()
  snapshot.entries.unshift(['X'.repeat(MAX_CACHE_BYTES),[]])
  const stored=await encodeCache(fingerprint,snapshot)
  assert.ok(new TextEncoder().encode(stored.payload).byteLength<=MAX_CACHE_BYTES)
  assert.equal(JSON.parse(stored.payload).entries.length,2)
})
test('storage failures fall back without preventing an ordinary search',async()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open(){throw new Error('Storage denied')}}})
  try {
    const loaded=await loadWordCache(dictionary)
    assert.equal(loaded.snapshot,null)
    assert.equal(await saveWordCache(loaded.fingerprint,new WordSearchCache().snapshot()),false)
    assert.equal(solve(words,dictionary).status,'solved')
  } finally {
    if(old) Object.defineProperty(globalThis,'indexedDB',old)
    else delete globalThis.indexedDB
  }
})
