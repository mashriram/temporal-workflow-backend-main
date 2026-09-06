import { topoSortWithCycleBreak } from './topo-sort';
import { Binding } from './types';

function binding(
  from: string,
  to: string,
  discoveryOrder: number,
  matchedKey = 'x',
): Binding {
  return {
    fromNodeId: from,
    toNodeId: to,
    fromPath: matchedKey,
    matchedKey,
    toField: 'body',
    viaPlaceholder: true,
    discoveryOrder,
  };
}

describe('topoSortWithCycleBreak', () => {
  it('sorts a simple acyclic chain in dependency order', () => {
    const { order, removed } = topoSortWithCycleBreak(
      ['a', 'b', 'c'],
      [binding('a', 'b', 0), binding('b', 'c', 1)],
      new Map([
        ['a', null],
        ['b', null],
        ['c', null],
      ]),
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]),
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(removed).toHaveLength(0);
  });

  it('breaks a 3-node cycle by removing the most recently discovered edge', () => {
    // a -> b -> c -> a, discovered in that order (c->a is last/most recent).
    const bindings = [
      binding('a', 'b', 0, 'key_ab'),
      binding('b', 'c', 1, 'key_bc'),
      binding('c', 'a', 2, 'key_ca'),
    ];

    const { order, edges, removed } = topoSortWithCycleBreak(
      ['a', 'b', 'c'],
      bindings,
      new Map([
        ['a', null],
        ['b', null],
        ['c', null],
      ]),
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]),
    );

    // The cycle must be broken, not silently ignored: all 3 nodes appear
    // exactly once in a valid order, and exactly the c->a edge (the one
    // discovered last) was removed.
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c']));
    expect(removed).toHaveLength(1);
    expect(removed[0].source).toBe('c');
    expect(removed[0].target).toBe('a');
    expect(removed[0].bindings[0].matchedKey).toBe('key_ca');

    // The surviving edges must no longer contain the removed one.
    expect(edges.some((e) => e.source === 'c' && e.target === 'a')).toBe(false);
    expect(edges.some((e) => e.source === 'a' && e.target === 'b')).toBe(true);
    expect(edges.some((e) => e.source === 'b' && e.target === 'c')).toBe(true);

    // a must come before b, and b before c, in the resolved order.
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('uses explicit naming-convention order to break ties among independent nodes', () => {
    // No edges at all between a/b/c — pure tiebreak by explicitOrder.
    const { order } = topoSortWithCycleBreak(
      ['c', 'a', 'b'], // original collection order deliberately scrambled
      [],
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
      new Map([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
