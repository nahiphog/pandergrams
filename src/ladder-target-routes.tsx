import { useState } from 'react'
import { targetRoutes } from './ladder'
import type { ExplorationResult } from './ladder'

export function LadderTargetRoutes({ graph, end }: { graph: ExplorationResult; end: string }) {
  const [offset, setOffset] = useState(0n)
  const count = BigInt(graph.nodes[end].pathCount)
  const routes = targetRoutes(graph, end, offset)
  return <div>
    <p>All {count.toLocaleString()} shortest paths found. No word repeats within any path.</p>
    <p aria-live="polite">Showing paths {(offset + 1n).toLocaleString()}–{(offset + BigInt(routes.length)).toLocaleString()} of {count.toLocaleString()}.</p>
    <ul className="ordered-route-list">{routes.map((route, index) => <li key={route.path.join(',')}>
      <p>Path {(offset + BigInt(index) + 1n).toLocaleString()}: {route.path.join(' → ')}</p>
      {route.moves.length > 0 && <details><summary>Step details</summary><ol>{route.moves.map((move, step) => <li key={step}>{route.path[step]} → {route.path[step + 1]}: {move.description}</li>)}</ol></details>}
    </li>)}</ul>
    {count > 10n && <div className="search-actions"><button disabled={offset === 0n} onClick={() => setOffset(offset - 10n)}>Previous paths</button><button disabled={offset + 10n >= count} onClick={() => setOffset(offset + 10n)}>Next paths</button></div>}
  </div>
}
