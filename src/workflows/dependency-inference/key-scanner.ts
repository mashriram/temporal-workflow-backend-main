import { Binding, InferredNode } from './types';

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

// Values too generic to be a meaningful data-dependency signal for the
// weaker literal-value fallback scan (booleans, tiny numbers, empty-ish
// strings) — matching implementation.md §5's "skip booleans, tiny ints,
// empty strings" guidance.
function isMeaningfulValue(value: unknown): value is string | number {
  if (typeof value === 'string') return value.trim().length >= 3;
  if (typeof value === 'number')
    return !Number.isInteger(value) || Math.abs(value) >= 100;
  return false;
}

/** Flattens a parsed JSON value into (dotPath, value) pairs. */
function flatten(
  obj: unknown,
  prefix = '',
): Array<{ path: string; value: unknown }> {
  const out: Array<{ path: string; value: unknown }> = [];
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object') {
    if (prefix) out.push({ path: prefix, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    // Only descend into the first element — arrays of records aren't a
    // useful "produced key" source beyond that for this heuristic.
    if (obj.length > 0) out.push(...flatten(obj[0], prefix));
    return out;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      out.push(...flatten(value, path));
    } else {
      out.push({ path, value });
    }
  }
  return out;
}

/**
 * Builds the full set of inferred data-dependency bindings across a
 * collection of parsed request nodes, per implementation.md §5:
 *  1. Primary signal: {{placeholder}} in a consumer's url/headers/body
 *     whose name matches (exactly, or as the final path segment of) a
 *     producer's flattened example-response key.
 *  2. Fallback (only if NO {{}} placeholder exists anywhere in the whole
 *     collection, to avoid false positives): literal-value substring
 *     matching between a producer's response values and every other
 *     node's raw text.
 */
export function inferBindings(nodes: InferredNode[]): Binding[] {
  const bindings: Binding[] = [];
  let discoveryOrder = 0;

  const anyPlaceholderExists = nodes.some((n) =>
    PLACEHOLDER_RE.test(n.rawText),
  );
  // .test() with a global regex mutates lastIndex — reset before reuse.
  PLACEHOLDER_RE.lastIndex = 0;

  const flattenedByNode = new Map<
    string,
    Array<{ path: string; value: unknown }>
  >();
  for (const node of nodes) {
    flattenedByNode.set(
      node.id,
      node.exampleResponse ? flatten(node.exampleResponse) : [],
    );
  }

  for (const consumer of nodes) {
    if (anyPlaceholderExists) {
      const matches = [...consumer.rawText.matchAll(PLACEHOLDER_RE)];
      for (const match of matches) {
        const placeholderName = match[1];
        const producer = findProducerForKey(
          nodes,
          flattenedByNode,
          consumer.id,
          placeholderName,
        );
        if (producer) {
          bindings.push({
            fromNodeId: producer.nodeId,
            fromPath: producer.path,
            toNodeId: consumer.id,
            toField: fieldForMatch(consumer, match[0]),
            matchedKey: placeholderName,
            viaPlaceholder: true,
            discoveryOrder: discoveryOrder++,
          });
        }
      }
    } else {
      // Weaker signal: scan for literal values from earlier producers.
      for (const producer of nodes) {
        if (producer.id === consumer.id) continue;
        for (const { path, value } of flattenedByNode.get(producer.id) || []) {
          if (!isMeaningfulValue(value)) continue;
          const literal = String(value);
          if (consumer.rawText.includes(literal)) {
            bindings.push({
              fromNodeId: producer.id,
              fromPath: path,
              toNodeId: consumer.id,
              toField: fieldForMatch(consumer, literal),
              matchedKey: path.split('.').pop() || path,
              viaPlaceholder: false,
              discoveryOrder: discoveryOrder++,
            });
          }
        }
      }
    }
  }

  return bindings;
}

function findProducerForKey(
  nodes: InferredNode[],
  flattenedByNode: Map<string, Array<{ path: string; value: unknown }>>,
  consumerId: string,
  keyName: string,
): { nodeId: string; path: string } | null {
  const lastSegment = keyName.split('.').pop();
  for (const node of nodes) {
    if (node.id === consumerId) continue;
    const flat = flattenedByNode.get(node.id) || [];
    const hit = flat.find(
      (f) => f.path === keyName || f.path.split('.').pop() === lastSegment,
    );
    if (hit) return { nodeId: node.id, path: hit.path };
  }
  return null;
}

function fieldForMatch(
  node: InferredNode,
  matchedText: string,
): 'url' | 'headers' | 'body' {
  if (node.url.includes(matchedText)) return 'url';
  if (node.body && node.body.includes(matchedText)) return 'body';
  return 'headers';
}
