import { Injectable, BadRequestException } from '@nestjs/common';
import { parsePostmanCollection, PostmanCollection } from './postman-parser';
import { inferBindings } from './key-scanner';
import { topoSortWithCycleBreak } from './topo-sort';
import {
  Binding,
  InferenceResult,
  InferredNode,
  OutputEdge,
  OutputNode,
  RemovedEdgeInfo,
} from './types';

const LAYOUT_X = 400;
const LAYOUT_Y_STEP = 160;
const LAYOUT_Y_START = 100;

@Injectable()
export class DependencyInferenceService {
  importPostman(collection: PostmanCollection): InferenceResult {
    const nodes = parsePostmanCollection(collection);
    if (nodes.length === 0) {
      throw new BadRequestException(
        'Postman collection has no requests to import',
      );
    }

    const bindings = inferBindings(nodes);
    const { order, edges, removed } = this.sort(nodes, bindings);

    return this.buildResult(nodes, order, edges, removed, bindings);
  }

  /**
   * "Auto-wire dependencies" on a hand-built graph: scans each node's
   * config for {{otherNodeId.path}} references to another node already on
   * the canvas, and proposes an edge for any such reference that isn't
   * already manually connected. Runs the same cycle-detection/removal as
   * Postman import — this is the same underlying algorithm, just skipping
   * the Postman-parsing step, per implementation.md §5.
   */
  autoWire(
    nodes: Array<{ id: string; data?: { config?: Record<string, any> } }>,
    existingEdges: Array<{ source: string; target: string }>,
  ): { removedEdges: RemovedEdgeInfo[]; addedEdges: OutputEdge[] } {
    const nodeIds = nodes.map((n) => n.id);
    const nodeIdSet = new Set(nodeIds);
    const existingPairs = new Set(
      existingEdges.map((e) => `${e.source}->${e.target}`),
    );

    const bindings: Binding[] = [];
    let discoveryOrder = 0;
    const refRe = /\{\{\s*([\w-]+)\.([\w.]+)\s*\}\}/g;

    for (const node of nodes) {
      const configText = JSON.stringify(node.data?.config || {});
      for (const match of configText.matchAll(refRe)) {
        const [, sourceId, sourcePath] = match;
        if (!nodeIdSet.has(sourceId) || sourceId === node.id) continue;
        const isExisting = existingPairs.has(`${sourceId}->${node.id}`);
        bindings.push({
          fromNodeId: sourceId,
          fromPath: sourcePath,
          toNodeId: node.id,
          toField: 'body',
          matchedKey: sourcePath,
          viaPlaceholder: true,
          // Pre-existing user-drawn edges get a discoveryOrder far below
          // any newly-inferred one, so cycle-breaking always prefers to
          // drop a new suggestion over something the user already wired
          // by hand — auto-wire only ever ADDS, never silently undoes
          // manual work (goal.md §3.1.4).
          discoveryOrder: isExisting ? -1_000_000 + discoveryOrder++ : discoveryOrder++,
        });
      }
    }

    const explicitOrder = new Map(nodeIds.map((id) => [id, null]));
    const originalOrder = new Map(nodeIds.map((id, i) => [id, i]));
    const { edges, removed } = topoSortWithCycleBreak(
      nodeIds,
      bindings,
      explicitOrder,
      originalOrder,
    );

    const nameOf = (id: string) => id;
    const removedEdges: RemovedEdgeInfo[] = removed.map((e) => ({
      source: e.source,
      sourceName: nameOf(e.source),
      target: e.target,
      targetName: nameOf(e.target),
      matchedKey: e.bindings[0]?.matchedKey || '',
      reason:
        'Would have closed a circular dependency — removed the most ' +
        'recently discovered edge in the cycle. Re-wire manually if this ' +
        "wasn't intended.",
    }));

    const addedEdges: OutputEdge[] = edges
      .filter((e) => !existingPairs.has(`${e.source}->${e.target}`))
      .map((e) => ({
        id: `edge_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
        animated: true,
        data: {
          sourceOutputKey: e.bindings[0]?.fromPath || '',
          targetVariableName: e.bindings[0]?.matchedKey || '',
        },
      }));

    return { removedEdges, addedEdges };
  }

  private sort(nodes: InferredNode[], bindings: Binding[]) {
    const nodeIds = nodes.map((n) => n.id);
    const explicitOrder = new Map(nodes.map((n) => [n.id, n.explicitOrder]));
    const originalOrder = new Map(nodes.map((n) => [n.id, n.order]));
    return topoSortWithCycleBreak(nodeIds, bindings, explicitOrder, originalOrder);
  }

  private buildResult(
    nodes: InferredNode[],
    order: string[],
    edges: ReturnType<typeof topoSortWithCycleBreak>['edges'],
    removed: ReturnType<typeof topoSortWithCycleBreak>['removed'],
    allBindings: Binding[],
  ): InferenceResult {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Rewrite each consumer's {{placeholderName}} occurrences to the
    // concrete {{sourceNodeId.sourcePath}} syntax the interpreter already
    // understands, so an imported workflow is runnable immediately (not
    // just visually wired) — see goal.md §3.1 "auto-populate B's
    // reference to A's output".
    const rewritesByNode = new Map<string, Array<{ from: string; to: string }>>();
    for (const b of allBindings) {
      if (!b.viaPlaceholder) continue;
      const list = rewritesByNode.get(b.toNodeId) || [];
      list.push({
        from: `{{${b.matchedKey}}}`,
        to: `{{${b.fromNodeId}.${b.fromPath}}}`,
      });
      rewritesByNode.set(b.toNodeId, list);
    }

    const outputNodes: OutputNode[] = order.map((nodeId, index) => {
      const node = byId.get(nodeId)!;
      let body = node.body;
      let url = node.url;
      const headers = { ...node.headers };
      for (const rewrite of rewritesByNode.get(nodeId) || []) {
        if (body) body = body.split(rewrite.from).join(rewrite.to);
        url = url.split(rewrite.from).join(rewrite.to);
        for (const key of Object.keys(headers)) {
          headers[key] = headers[key].split(rewrite.from).join(rewrite.to);
        }
      }

      return {
        id: node.id,
        type: 'make_http_call',
        position: { x: LAYOUT_X, y: LAYOUT_Y_START + index * LAYOUT_Y_STEP },
        data: {
          label: node.name,
          type: 'make_http_call',
          status: 'idle',
          config: {
            method: node.method,
            url,
            headers: JSON.stringify(headers),
            body: body || undefined,
          },
        },
      };
    });

    const outputEdges: OutputEdge[] = edges.map((e) => ({
      id: `edge_${e.source}_${e.target}`,
      source: e.source,
      target: e.target,
      animated: true,
      data: {
        sourceOutputKey: e.bindings[0]?.fromPath || '',
        targetVariableName: e.bindings[0]?.matchedKey || '',
      },
    }));

    const removedEdges: RemovedEdgeInfo[] = removed.map((e) => ({
      source: e.source,
      sourceName: byId.get(e.source)?.name || e.source,
      target: e.target,
      targetName: byId.get(e.target)?.name || e.target,
      matchedKey: e.bindings[0]?.matchedKey || '',
      reason:
        'Would have closed a circular dependency — removed the most ' +
        'recently discovered edge in the cycle. Re-wire manually if this ' +
        "wasn't intended.",
    }));

    return { nodes: outputNodes, edges: outputEdges, removedEdges };
  }
}
