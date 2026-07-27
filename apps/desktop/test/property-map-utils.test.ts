import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPropertyMapClustersFromOffsets,
  removePropertyMapListeners,
} from '../src/renderer/routes/_authenticated/properties/-property-map-utils';

interface TestPoint {
  id: string;
  lat: number;
  lng: number;
  groupCount: number;
  listingCount: number;
}

function point(id: string, x: number, y: number, groupCount = 1): { point: TestPoint; offsetX: number; offsetY: number } {
  return {
    point: {
      id,
      lat: y,
      lng: x,
      groupCount,
      listingCount: groupCount * 2,
    },
    offsetX: x,
    offsetY: y,
  };
}

describe('property map clustering', () => {
  it('clusters nearby points by screen radius instead of exact grid cell', () => {
    const clusters = buildPropertyMapClustersFromOffsets(
      [
        point('a', 83, 20, 2),
        point('b', 86, 20, 3),
        point('c', 240, 20, 1),
      ],
      { zoom: 15, maxZoom: 17, clusterRadius: 84 },
    );

    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters[0].points.map((item) => item.id), ['a', 'b']);
    assert.equal(clusters[0].groupCount, 5);
    assert.equal(clusters[0].listingCount, 10);
    assert.equal(clusters[0].lng, 84.5);
    assert.equal(clusters[1].points[0].id, 'c');
  });

  it('keeps points separate when they are outside the cluster radius', () => {
    const clusters = buildPropertyMapClustersFromOffsets(
      [point('a', 0, 0), point('b', 85, 0)],
      { zoom: 15, maxZoom: 17, clusterRadius: 84 },
    );

    assert.equal(clusters.length, 2);
  });

  it('disables clustering past the configured max zoom', () => {
    const clusters = buildPropertyMapClustersFromOffsets(
      [point('a', 0, 0), point('b', 10, 0)],
      { zoom: 18, maxZoom: 17, clusterRadius: 84 },
    );

    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters.map((cluster) => cluster.points.length), [1, 1]);
  });

  it('skips null listener handles during map cleanup', () => {
    const removed: unknown[] = [];

    removePropertyMapListeners(
      [null, 'marker-listener', undefined, 'map-listener'],
      (listener) => removed.push(listener),
    );

    assert.deepEqual(removed, ['marker-listener', 'map-listener']);
  });
});
