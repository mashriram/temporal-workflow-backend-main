// Pure-logic types for the dependency-inference module. Deliberately not
// reusing workflow.types.ts's narrow NodeType union — Postman-imported
// nodes are always 'make_http_call', which predates that union, and this
// module's output nodes/edges are React-Flow-shaped but not validated
// against AppNode (same looseness DeployWorkflowDto already accepts).

export interface InferredNode {
  id: string;
  name: string;
  order: number; // original collection order (0-based)
  explicitOrder: number | null; // parsed leading "1.", "2)" etc, or null
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  rawText: string; // url + headers + body concatenated, for placeholder/literal scanning
  exampleResponse: unknown | null; // parsed first saved example response body, if any
}

export interface Binding {
  fromNodeId: string;
  fromPath: string; // dot-path into producer's example response, e.g. "data.certId"
  toNodeId: string;
  toField: 'url' | 'headers' | 'body';
  matchedKey: string; // the placeholder name or literal value that matched
  viaPlaceholder: boolean; // {{var}} name match vs. weaker literal-value scan
  discoveryOrder: number; // insertion order — cycle-breaking removes the highest
}

export interface RemovedEdgeInfo {
  source: string;
  sourceName: string;
  target: string;
  targetName: string;
  matchedKey: string;
  reason: string;
}

export interface OutputNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: string;
    status: 'idle';
    config: Record<string, any>;
  };
}

export interface OutputEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  data?: { sourceOutputKey: string; targetVariableName: string };
}

export interface InferenceResult {
  nodes: OutputNode[];
  edges: OutputEdge[];
  removedEdges: RemovedEdgeInfo[];
}
