import { Binding } from './types';

export interface GraphEdge {
  source: string;
  target: string;
  discoveryOrder: number; // max discoveryOrder among bindings collapsed into this edge
  bindings: Binding[];
}

export interface TopoSortResult {
  order: string[];
  edges: GraphEdge[]; // surviving edges, after any cycle-breaking removals
  removed: GraphEdge[]; // edges removed to break a cycle, in removal order
}

/** Collapses per-binding edges into unique (source, target) graph edges. */
function collapseEdges(bindings: Binding[]): GraphEdge[] {
  const byPair = new Map<string, GraphEdge>();
  for (const b of bindings) {
    if (b.fromNodeId === b.toNodeId) continue; // never a real dependency
    const key = `${b.fromNodeId}->${b.toNodeId}`;
    const existing = byPair.get(key);
    if (existing) {
      existing.bindings.push(b);
      existing.discoveryOrder = Math.max(existing.discoveryOrder, b.discoveryOrder);
    } else {
      byPair.set(key, {
        source: b.fromNodeId,
        target: b.toNodeId,
        discoveryOrder: b.discoveryOrder,
        bindings: [b],
      });
    }
  }
  return [...byPair.values()];
}

/**
 * Kahn's-algorithm topological sort over `nodeIds` using `edges`, with
 * `explicitOrder` (parsed "1.", "2." naming convention — null if absent)
 * and `originalOrder` (collection order) as secondary sort keys among
 * nodes that become ready (in-degree 0) at the same point.
 */
function kahn(
  nodeIds: string[],
  edges: GraphEdge[],
  explicitOrder: Map<string, number | null>,
  originalOrder: Map<string, number>,
): { order: string[]; processed: Set<string> } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const e of edges) {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue;
    adjacency.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const ready = nodeIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  const processed = new Set<string>();

  const compareReady = (a: string, b: string) => {
    const ea = explicitOrder.get(a);
    const eb = explicitOrder.get(b);
    if (ea !== null && ea !== undefined && eb !== null && eb !== undefined && ea !== eb) {
      return ea - eb;
    }
    if (ea !== null && ea !== undefined && (eb === null || eb === undefined)) return -1;
    if (eb !== null && eb !== undefined && (ea === null || ea === undefined)) return 1;
    return (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0);
  };

  while (ready.length > 0) {
    ready.sort(compareReady);
    const next = ready.shift()!;
    order.push(next);
    processed.add(next);
    for (const neighbor of adjacency.get(next) || []) {
      const remaining = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, remaining);
      if (remaining === 0) ready.push(neighbor);
    }
  }

  return { order, processed };
}

/** DFS over the subgraph of unprocessed nodes to find one cycle's edges. */
function findCycleEdges(unprocessed: Set<string>, edges: GraphEdge[]): GraphEdge[] | null {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const id of unprocessed) adjacency.set(id, []);
  for (const e of edges) {
    if (unprocessed.has(e.source) && unprocessed.has(e.target)) {
      adjacency.get(e.source)!.push(e);
    }
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>([...unprocessed].map((id) => [id, WHITE]));
  const pathEdges: GraphEdge[] = [];

  function dfs(nodeId: string): GraphEdge[] | null {
    color.set(nodeId, GRAY);
    for (const edge of adjacency.get(nodeId) || []) {
      const targetColor = color.get(edge.target);
      if (targetColor === GRAY) {
        // Found the back-edge that closes the cycle — walk pathEdges back
        // to where `edge.target` first entered the current path.
        const cycleStart = pathEdges.findIndex((e) => e.source === edge.target);
        const cycle = cycleStart === -1 ? [edge] : [...pathEdges.slice(cycleStart), edge];
        return cycle;
      }
      if (targetColor === WHITE) {
        pathEdges.push(edge);
        const found = dfs(edge.target);
        if (found) return found;
        pathEdges.pop();
      }
    }
    color.set(nodeId, BLACK);
    return null;
  }

  for (const id of unprocessed) {
    if (color.get(id) === WHITE) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Topologically sorts `nodeIds` given `bindings`, breaking any cycles by
 * repeatedly removing the most-recently-discovered edge in the cycle
 * (highest discoveryOrder) and retrying — never silently, always
 * reporting exactly what was removed and why (implementation.md §5.6 /
 * goal.md §3.1.4).
 */
export function topoSortWithCycleBreak(
  nodeIds: string[],
  bindings: Binding[],
  explicitOrder: Map<string, number | null>,
  originalOrder: Map<string, number>,
): TopoSortResult {
  let edges = collapseEdges(bindings);
  const removed: GraphEdge[] = [];

  // Bounded by nodeIds.length: each iteration either finishes (all nodes
  // processed) or removes exactly one edge, and a graph has finitely many
  // edges to remove before it's a DAG — this is a safety cap, not the
  // expected path.
  for (let attempt = 0; attempt <= nodeIds.length; attempt++) {
    const { order, processed } = kahn(nodeIds, edges, explicitOrder, originalOrder);
    if (processed.size === nodeIds.length) {
      return { order, edges, removed };
    }

    const unprocessed = new Set(nodeIds.filter((id) => !processed.has(id)));
    const cycle = findCycleEdges(unprocessed, edges);
    if (!cycle || cycle.length === 0) {
      // Shouldn't happen (leftover nodes with no edges among them would
      // have been picked up by Kahn's already), but never loop forever.
      return { order: [...order, ...unprocessed], edges, removed };
    }

    const offending = cycle.reduce((a, b) => (b.discoveryOrder > a.discoveryOrder ? b : a));
    edges = edges.filter((e) => e !== offending);
    removed.push(offending);
  }

  // Exhausted the safety cap — return whatever Kahn's last produced plus
  // any stragglers, rather than throwing.
  const { order } = kahn(nodeIds, edges, explicitOrder, originalOrder);
  return { order, edges, removed };
}
