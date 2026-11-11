export interface PropertyMapClusterSource {
  id: string;
  lat: number;
  lng: number;
  groupCount: number;
  listingCount: number;
}

export interface PropertyMapOffsetPoint<TPoint extends PropertyMapClusterSource> {
  point: TPoint;
  offsetX: number;
  offsetY: number;
}

export interface PropertyMapClusterResult<TPoint extends PropertyMapClusterSource> {
  id: string;
  lat: number;
  lng: number;
  points: TPoint[];
  groupCount: number;
  listingCount: number;
}

interface BuildPropertyMapClusterOptions {
  zoom: number;
  maxZoom: number;
  clusterRadius: number;
}

export function buildPropertyMapClustersFromOffsets<TPoint extends PropertyMapClusterSource>(
  offsetPoints: Array<PropertyMapOffsetPoint<TPoint>>,
  options: BuildPropertyMapClusterOptions,
): Array<PropertyMapClusterResult<TPoint>> {
  if (offsetPoints.length === 0) return [];
  if (options.zoom > options.maxZoom) {
    return offsetPoints.map(({ point }) => buildSinglePropertyMapCluster(point));
  }

  const clusters: Array<PropertyMapClusterResult<TPoint> & { offsetX: number; offsetY: number }> = [];
  const clusterRadiusSquared = options.clusterRadius ** 2;

  for (const { point, offsetX, offsetY } of offsetPoints) {
    const existing = clusters.find((cluster) => {
      const distanceX = cluster.offsetX - offsetX;
      const distanceY = cluster.offsetY - offsetY;
      return (distanceX * distanceX) + (distanceY * distanceY) <= clusterRadiusSquared;
    });

    if (existing) {
      const previousPointCount = existing.points.length;
      existing.points.push(point);
      existing.groupCount += point.groupCount;
      existing.listingCount += point.listingCount;
      existing.lat = getWeightedAverage(existing.lat, point.lat, previousPointCount);
      existing.lng = getWeightedAverage(existing.lng, point.lng, previousPointCount);
      existing.offsetX = getWeightedAverage(existing.offsetX, offsetX, previousPointCount);
      existing.offsetY = getWeightedAverage(existing.offsetY, offsetY, previousPointCount);
      continue;
    }

    clusters.push({
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      offsetX,
      offsetY,
      points: [point],
      groupCount: point.groupCount,
      listingCount: point.listingCount,
    });
  }

  return clusters.map(({ offsetX, offsetY, ...cluster }) => cluster);
}

/**
 * 네이버 지도 SDK는 https·file 페이지에서는 pstatic.net에서, 그 밖의 페이지(개발 서버,
 * 패키징 앱의 커스텀 프로토콜)에서는 http 호스트에서 스타일과 타일을 받는다.
 */
export function getNaverMapsPreconnectOrigins(pageProtocol: string): string[] {
  const usesSecureHosts = pageProtocol === 'https:' || pageProtocol === 'file:';

  return [
    'https://oapi.map.naver.com',
    usesSecureHosts ? 'https://nrbe.pstatic.net' : 'http://nrbe.map.naver.net',
  ];
}

export function removePropertyMapListeners(
  listeners: readonly unknown[],
  removeListener?: (listener: unknown) => void,
) {
  if (!removeListener) return;

  for (const listener of listeners) {
    if (listener !== null && listener !== undefined) {
      removeListener(listener);
    }
  }
}

function buildSinglePropertyMapCluster<TPoint extends PropertyMapClusterSource>(
  point: TPoint,
): PropertyMapClusterResult<TPoint> {
  return {
    id: point.id,
    lat: point.lat,
    lng: point.lng,
    points: [point],
    groupCount: point.groupCount,
    listingCount: point.listingCount,
  };
}

function getWeightedAverage(currentAverage: number, nextValue: number, previousCount: number) {
  return ((currentAverage * previousCount) + nextValue) / (previousCount + 1);
}
