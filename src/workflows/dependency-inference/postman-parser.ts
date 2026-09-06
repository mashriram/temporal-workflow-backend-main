import { InferredNode } from './types';

// Postman Collection v2.1 is a loosely-typed, deeply nested JSON format.
// We only need a handful of fields; everything else is ignored.
interface PostmanUrl {
  raw?: string;
}
interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}
interface PostmanBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | string;
  raw?: string;
}
interface PostmanResponse {
  body?: string;
}
interface PostmanRequest {
  method?: string;
  url?: PostmanUrl | string;
  header?: PostmanHeader[];
  body?: PostmanBody;
}
interface PostmanItem {
  name?: string;
  item?: PostmanItem[]; // nested folder
  request?: PostmanRequest;
  response?: PostmanResponse[];
}
export interface PostmanCollection {
  info?: { name?: string };
  item?: PostmanItem[];
}

const ORDER_MARKER_RE = /^\s*(\d+)[.)]\s*/;

/** Flattens nested Postman folders into a single ordered list of request items. */
function flattenItems(items: PostmanItem[] | undefined): PostmanItem[] {
  if (!items) return [];
  const out: PostmanItem[] = [];
  for (const item of items) {
    if (item.item) {
      out.push(...flattenItems(item.item));
    } else if (item.request) {
      out.push(item);
    }
  }
  return out;
}

function parseExampleResponse(item: PostmanItem): unknown | null {
  const raw = item.response?.[0]?.body;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parsePostmanCollection(
  collection: PostmanCollection,
): InferredNode[] {
  const flat = flattenItems(collection.item);

  return flat.map((item, index) => {
    const name = item.name || `Request ${index + 1}`;
    const orderMatch = name.match(ORDER_MARKER_RE);
    const explicitOrder = orderMatch ? Number.parseInt(orderMatch[1], 10) : null;

    const method = (item.request?.method || 'GET').toUpperCase();
    const url =
      typeof item.request?.url === 'string'
        ? item.request.url
        : item.request?.url?.raw || '';

    const headers: Record<string, string> = {};
    for (const h of item.request?.header || []) {
      if (!h.disabled) headers[h.key] = h.value;
    }

    const body =
      item.request?.body?.mode === 'raw' ? item.request.body.raw || null : null;

    const rawText = [url, JSON.stringify(headers), body || ''].join('\n');

    return {
      id: `node_${index}_${slugify(name)}`,
      name,
      order: index,
      explicitOrder,
      method,
      url,
      headers,
      body,
      rawText,
      exampleResponse: parseExampleResponse(item),
    };
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
