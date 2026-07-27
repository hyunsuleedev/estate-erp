import type {
  ListingIntake,
  ListingIntakeListing,
} from "@estate-erp/api-client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MapPin, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain";
import { formatMoney, formatRent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildPropertyMapClustersFromOffsets,
  removePropertyMapListeners,
  type PropertyMapClusterResult,
  type PropertyMapClusterSource,
} from "./-property-map-utils";

const NAVER_MAPS_NCP_KEY_ID = import.meta.env
  .VITE_NAVER_MAPS_NCP_KEY_ID as string | undefined;
const PROPERTY_MAP_CLUSTER_RADIUS = 84;
const PROPERTY_MAP_CLUSTER_MAX_ZOOM = 17;

type NaverMapsApi = {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
  Point: new (x: number, y: number) => NaverPoint;
  Map: new (element: HTMLElement, options?: Record<string, unknown>) => {
    setCenter: (coord: unknown) => void;
    setZoom: (zoom: number) => void;
    getZoom: () => number;
    getProjection: () => {
      fromCoordToOffset: (coord: unknown) => NaverPoint;
    };
    fitBounds?: (
      bounds: unknown,
      options?: Record<string, number>,
    ) => void;
  };
  Marker: new (options: Record<string, unknown>) => {
    setMap: (map: unknown | null) => void;
  };
  Event: {
    addListener: (
      target: unknown,
      eventName: string,
      handler: () => void,
    ) => unknown;
    removeListener?: (listener: unknown) => void;
  };
};

interface NaverLatLng {
  lat?: () => number;
  lng?: () => number;
}

interface NaverPoint {
  x: number;
  y: number;
}

declare global {
  interface Window {
    naver?: { maps?: NaverMapsApi };
    __estateErpNaverMapsPromise?: Promise<NaverMapsApi>;
  }
}

type MapProperty = NonNullable<ListingIntake["property"]>;

interface PropertyMapGroup {
  id: string;
  propertyId: string;
  property?: ListingIntake["property"];
  intakes: ListingIntake[];
  listings: ListingIntakeListing[];
}

interface PropertyMapPoint extends PropertyMapClusterSource {
  id: string;
  siteId: string;
  siteName: string;
  address: string;
  lat: number;
  lng: number;
  groups: PropertyMapGroup[];
  groupCount: number;
  listingCount: number;
}

type PropertyMapCluster = PropertyMapClusterResult<PropertyMapPoint>;

interface PropertyMapViewProps {
  items: ListingIntake[];
  isLoading: boolean;
  isError: boolean;
  truncated: boolean;
  limit?: number;
  hasActiveFilters: boolean;
  onSelectProperty: (propertyId: string) => void;
  onRetry: () => void;
}

export function PropertyMapView({
  items,
  isLoading,
  isError,
  truncated,
  limit,
  hasActiveFilters,
  onSelectProperty,
  onRetry,
}: PropertyMapViewProps) {
  const groups = useMemo(() => buildPropertyMapGroups(items), [items]);
  const { points, missingGroups } = useMemo(
    () => buildPropertyMapPoints(groups),
    [groups],
  );

  if (isLoading) {
    return <PropertyMapSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white py-16">
        <p className="text-sm text-muted-foreground">
          지도 매물을 불러오지 못했습니다.
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  if (points.length === 0 && missingGroups.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white text-sm text-muted-foreground">
        {hasActiveFilters
          ? "조건에 맞는 매물이 없습니다."
          : "등록된 매물이 없습니다."}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(300px,340px)] bg-white">
      <div className="relative min-h-0 overflow-hidden border-r border-border bg-[#f7f7f5]">
        <NaverPropertyMap
          points={points}
          missingCount={missingGroups.length}
          onSelectProperty={onSelectProperty}
        />
      </div>

      <aside
        className="flex min-h-0 flex-col bg-white"
        aria-label="지도 매물 목록"
      >
        <div className="shrink-0 border-b border-border px-3.5 py-2.5">
          <div className="text-[12px] font-semibold text-foreground">
            지도 매물
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            좌표 있는 단지 {points.length.toLocaleString()}곳 · 매물{" "}
            {groups.length.toLocaleString()}건
            {truncated && limit
              ? ` · 최대 ${limit.toLocaleString()}건`
              : ""}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {points.flatMap((point) =>
            point.groups.map((group) => (
              <MapPropertyRow
                key={group.id}
                group={group}
                point={point}
                onClick={() => onSelectProperty(group.propertyId)}
              />
            )),
          )}
          {missingGroups.length > 0 && (
            <div className="border-y border-border bg-muted/20 px-3.5 py-2 text-[11px] font-semibold text-muted-foreground">
              좌표 미등록 {missingGroups.length.toLocaleString()}건
            </div>
          )}
          {missingGroups.map((group) => (
            <MapPropertyRow
              key={group.id}
              group={group}
              onClick={() => onSelectProperty(group.propertyId)}
              muted
            />
          ))}
        </div>
      </aside>
    </div>
  );
}

function PropertyMapSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(300px,340px)] bg-white">
      <div className="relative min-h-[420px] border-r border-border bg-muted/30 p-4">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
      </div>
    </div>
  );
}

function NaverPropertyMap({
  points,
  missingCount,
  onSelectProperty,
}: {
  points: PropertyMapPoint[];
  missingCount: number;
  onSelectProperty: (propertyId: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<NaverMapsApi["Map"]> | null>(null);
  const markersRef = useRef<
    Array<InstanceType<NaverMapsApi["Marker"]>>
  >([]);
  const markerListenersRef = useRef<unknown[]>([]);
  const mapListenersRef = useRef<unknown[]>([]);
  const lastAutoFitKeyRef = useRef<string | null>(null);
  const [mapsApi, setMapsApi] = useState<NaverMapsApi | null>(() =>
    getReadyNaverMapsApi(),
  );
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(getReadyNaverMapsApi() ? "ready" : "idle");

  useEffect(() => {
    if (mapsApi || !NAVER_MAPS_NCP_KEY_ID) return;

    let cancelled = false;
    setLoadState("loading");
    loadNaverMaps(NAVER_MAPS_NCP_KEY_ID)
      .then((loadedMapsApi) => {
        if (cancelled) return;
        setMapsApi(loadedMapsApi);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [mapsApi]);

  useEffect(() => {
    if (!mapsApi || !mapElementRef.current || mapRef.current) return;

    const centerPoint = points[0] ?? { lat: 37.5665, lng: 126.978 };
    mapRef.current = new mapsApi.Map(mapElementRef.current, {
      center: new mapsApi.LatLng(centerPoint.lat, centerPoint.lng),
      zoom: points.length > 0 ? 15 : 11,
      mapDataControl: false,
      scaleControl: true,
      zoomControl: true,
    });
  }, [mapsApi, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapsApi || !map) return;

    const clearMarkers = () => {
      removePropertyMapListeners(
        markerListenersRef.current,
        (listener) => mapsApi.Event.removeListener?.(listener),
      );
      for (const marker of markersRef.current) {
        marker.setMap(null);
      }
      markerListenersRef.current = [];
      markersRef.current = [];
    };

    const clearMapListeners = () => {
      removePropertyMapListeners(
        mapListenersRef.current,
        (listener) => mapsApi.Event.removeListener?.(listener),
      );
      mapListenersRef.current = [];
    };

    clearMarkers();
    clearMapListeners();

    if (points.length === 0) return;

    const renderClusters = () => {
      clearMarkers();

      const clusters = buildPropertyMapClusters(points, map, mapsApi);
      for (const cluster of clusters) {
        const position = new mapsApi.LatLng(cluster.lat, cluster.lng);
        const isCluster = cluster.points.length > 1;
        const point = cluster.points[0];
        const marker = new mapsApi.Marker({
          map,
          position,
          title: isCluster
            ? `${cluster.groupCount}건`
            : `${point.siteName} ${point.groupCount}건`,
          icon: {
            content: isCluster
              ? getNaverClusterMarkerHtml(cluster)
              : getNaverMarkerHtml(point),
            anchor: isCluster
              ? new mapsApi.Point(24, 24)
              : new mapsApi.Point(20, 20),
          },
        });
        const listener = mapsApi.Event.addListener(marker, "click", () => {
          if (isCluster) {
            map.setCenter(position);
            map.setZoom(Math.min(map.getZoom() + 2, 19));
            return;
          }

          onSelectProperty(point.groups[0].propertyId);
        });
        markersRef.current.push(marker);
        markerListenersRef.current.push(listener);
      }
    };

    renderClusters();
    mapListenersRef.current = [
      mapsApi.Event.addListener(map, "idle", renderClusters),
      mapsApi.Event.addListener(map, "zoom_changed", renderClusters),
    ];

    const autoFitKey = points
      .map((point) => `${point.id}:${point.groupCount}`)
      .sort()
      .join("|");
    if (lastAutoFitKeyRef.current !== autoFitKey) {
      lastAutoFitKeyRef.current = autoFitKey;
      if (points.length === 1) {
        map.setCenter(new mapsApi.LatLng(points[0].lat, points[0].lng));
        map.setZoom(16);
      } else {
        const bounds = getMapBounds(points);
        map.fitBounds?.(
          new mapsApi.LatLngBounds(
            new mapsApi.LatLng(bounds.minLat, bounds.minLng),
            new mapsApi.LatLng(bounds.maxLat, bounds.maxLng),
          ),
          { top: 64, right: 64, bottom: 64, left: 64 },
        );
      }
    }

    return () => {
      clearMarkers();
      clearMapListeners();
    };
  }, [mapsApi, onSelectProperty, points]);

  return (
    <div
      className="relative h-full min-h-0 w-full"
      role="region"
      aria-label="네이버 지도 기반 매물 위치"
    >
      <div ref={mapElementRef} className="h-full w-full" />
      <div className="absolute left-4 top-4 z-10 rounded-lg border border-border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <MapPin className="size-3.5 text-emerald-600" />
          지도 표시 {points.length.toLocaleString()}곳
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          좌표 없음 {missingCount.toLocaleString()}건 · 마커를 누르면 상세 보기
        </div>
      </div>
      {!NAVER_MAPS_NCP_KEY_ID && (
        <NaverMapOverlayMessage
          title="네이버 지도 키가 필요합니다"
          detail={
            <>
              VITE_NAVER_MAPS_NCP_KEY_ID를 설정하면 지도가 표시됩니다.
              <br />
              현재 Web 서비스 URL: {getNaverMapsServiceUrl()}
            </>
          }
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === "loading" && (
        <NaverMapOverlayMessage
          title="네이버 지도를 불러오는 중입니다"
          detail="Maps JavaScript SDK를 초기화하고 있습니다."
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID && loadState === "error" && (
        <NaverMapOverlayMessage
          title="네이버 지도 로딩 실패"
          detail={
            <>
              ncpKeyId와 Naver Cloud의 Web 서비스 URL 등록값을 확인해 주세요.
              <br />
              현재 URL: {getNaverMapsServiceUrl()}
            </>
          }
        />
      )}
      {NAVER_MAPS_NCP_KEY_ID &&
        loadState === "ready" &&
        points.length === 0 && (
          <NaverMapOverlayMessage
            title="좌표가 등록된 매물이 없습니다"
            detail="단지 좌표가 있는 매물부터 지도에 표시됩니다."
          />
        )}
    </div>
  );
}

function NaverMapOverlayMessage({
  title,
  detail,
}: {
  title: string;
  detail: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65">
      <div className="max-w-md rounded-lg border border-border bg-white px-4 py-3 text-center shadow-sm">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          {detail}
        </div>
      </div>
    </div>
  );
}

function MapPropertyRow({
  group,
  point,
  onClick,
  muted,
}: {
  group: PropertyMapGroup;
  point?: PropertyMapPoint;
  onClick: () => void;
  muted?: boolean;
}) {
  const property = group.property;
  const siteName = property?.site?.name ?? "매물 정보 없음";
  const address =
    point?.address ??
    property?.site?.roadAddress ??
    property?.site?.jibunAddress ??
    "주소 미등록";
  const unitLabel = getPropertyMapUnitLabel(property);
  const priceLabel = getPropertyMapPriceLabel(group.listings);

  return (
    <button
      type="button"
      className={cn(
        "block w-full border-b border-border px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        muted && "bg-muted/10",
      )}
      onClick={onClick}
      aria-label={`${siteName} ${unitLabel} 상세 보기`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {siteName}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {[unitLabel, address].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {group.listings.length.toLocaleString()}건
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
        {group.listings.slice(0, 3).map((listing) => (
          <StatusBadge
            key={listing.id}
            kind="transactionType"
            status={listing.transactionType}
            size="sm"
          />
        ))}
        <span className="truncate text-[12px] font-medium text-slate-700">
          {priceLabel}
        </span>
      </div>
    </button>
  );
}

function buildPropertyMapGroups(
  intakes: ListingIntake[],
): PropertyMapGroup[] {
  const groups = new Map<string, PropertyMapGroup>();

  for (const intake of intakes) {
    const listings = intake.listings ?? [];
    if (listings.length === 0) continue;

    const existing = groups.get(intake.propertyId);
    if (existing) {
      existing.intakes.push(intake);
      const listingIds = new Set(
        existing.listings.map((listing) => listing.id),
      );
      for (const listing of listings) {
        if (!listingIds.has(listing.id)) {
          existing.listings.push(listing);
          listingIds.add(listing.id);
        }
      }
      if (!existing.property && intake.property) {
        existing.property = intake.property;
      }
      continue;
    }

    groups.set(intake.propertyId, {
      id: intake.propertyId,
      propertyId: intake.propertyId,
      property: intake.property,
      intakes: [intake],
      listings: [...listings],
    });
  }

  return Array.from(groups.values());
}

function buildPropertyMapPoints(groups: PropertyMapGroup[]) {
  const pointMap = new Map<string, PropertyMapPoint>();
  const missingGroups: PropertyMapGroup[] = [];

  for (const group of groups) {
    const site = group.property?.site;
    const lat = readCoordinate(site?.lat);
    const lng = readCoordinate(site?.lng);

    if (!site || lat === null || lng === null) {
      missingGroups.push(group);
      continue;
    }

    const key = `${site.id}:${lat}:${lng}`;
    const existing = pointMap.get(key);
    if (existing) {
      existing.groups.push(group);
      existing.groupCount += 1;
      existing.listingCount += group.listings.length;
      continue;
    }

    pointMap.set(key, {
      id: key,
      siteId: site.id,
      siteName: site.name,
      address:
        site.roadAddress ?? site.jibunAddress ?? "주소 미등록",
      lat,
      lng,
      groups: [group],
      groupCount: 1,
      listingCount: group.listings.length,
    });
  }

  return {
    points: Array.from(pointMap.values()).sort(
      (a, b) =>
        b.groups.length - a.groups.length ||
        a.siteName.localeCompare(b.siteName),
    ),
    missingGroups,
  };
}

function buildPropertyMapClusters(
  points: PropertyMapPoint[],
  map: InstanceType<NaverMapsApi["Map"]>,
  mapsApi: NaverMapsApi,
): PropertyMapCluster[] {
  if (points.length === 0) return [];

  const zoom = map.getZoom();
  const projection = map.getProjection();
  const offsetPoints = points.map((point) => {
    const offset = projection.fromCoordToOffset(
      new mapsApi.LatLng(point.lat, point.lng),
    );
    return {
      point,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  });

  return buildPropertyMapClustersFromOffsets(offsetPoints, {
    zoom,
    maxZoom: PROPERTY_MAP_CLUSTER_MAX_ZOOM,
    clusterRadius: PROPERTY_MAP_CLUSTER_RADIUS,
  });
}

function getMapBounds(points: PropertyMapPoint[]) {
  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLng: Math.min(bounds.minLng, point.lng),
      maxLng: Math.max(bounds.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
}

function readCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function getPropertyMapUnitLabel(property?: MapProperty) {
  if (!property?.unit) return "";
  const dong =
    property.unit.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name
      : "";
  return [dong, property.unit.name].filter(Boolean).join(" ");
}

function getPropertyMapPriceLabel(listings: ListingIntakeListing[]) {
  if (listings.length === 0) return "가격 미등록";

  return listings
    .slice()
    .sort(
      (a, b) =>
        getTransactionTypeOrder(a.transactionType) -
        getTransactionTypeOrder(b.transactionType),
    )
    .slice(0, 2)
    .map((listing) => {
      if (listing.transactionType === "monthly") {
        return formatRent(listing.deposit, listing.monthlyRent);
      }
      const price =
        listing.transactionType === "jeonse"
          ? listing.deposit
          : listing.price;
      return formatMoney(price);
    })
    .join(" · ");
}

function getTransactionTypeOrder(value: string) {
  if (value === "sale") return 0;
  if (value === "jeonse") return 1;
  if (value === "monthly") return 2;
  return 99;
}

function getReadyNaverMapsApi() {
  const mapsApi = window.naver?.maps;
  if (
    mapsApi &&
    typeof mapsApi.LatLng === "function" &&
    typeof mapsApi.LatLngBounds === "function" &&
    typeof mapsApi.Point === "function" &&
    typeof mapsApi.Map === "function" &&
    typeof mapsApi.Marker === "function" &&
    mapsApi.Event &&
    typeof mapsApi.Event.addListener === "function"
  ) {
    return mapsApi;
  }

  return null;
}

function loadNaverMaps(ncpKeyId: string) {
  const readyMapsApi = getReadyNaverMapsApi();
  if (readyMapsApi) {
    return Promise.resolve(readyMapsApi);
  }
  if (window.__estateErpNaverMapsPromise) {
    return window.__estateErpNaverMapsPromise;
  }

  window.__estateErpNaverMapsPromise = new Promise<NaverMapsApi>(
    (resolve, reject) => {
      const existingScript = document.getElementById(
        "naver-maps-js-sdk",
      ) as HTMLScriptElement | null;

      const handleLoad = () => {
        const loadedMapsApi = getReadyNaverMapsApi();
        if (loadedMapsApi) {
          resolve(loadedMapsApi);
          return;
        }
        reject(
          new Error("NAVER Maps SDK loaded without a ready maps API"),
        );
      };

      if (existingScript) {
        const loadedMapsApi = getReadyNaverMapsApi();
        if (loadedMapsApi) {
          resolve(loadedMapsApi);
          return;
        }
        if (existingScript.dataset.loadState === "loaded") {
          reject(new Error("NAVER Maps SDK is present but not ready"));
          return;
        }
        existingScript.addEventListener("load", handleLoad, {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("NAVER Maps SDK failed to load")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = "naver-maps-js-sdk";
      script.async = true;
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(ncpKeyId)}`;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loadState = "loaded";
          handleLoad();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        () => reject(new Error("NAVER Maps SDK failed to load")),
        { once: true },
      );
      document.head.appendChild(script);
    },
  );

  return window.__estateErpNaverMapsPromise;
}

function getNaverMapsServiceUrl() {
  return window.location.origin;
}

function getNaverMarkerHtml(point: PropertyMapPoint) {
  return `
    <div style="
      width: 40px;
      height: 40px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 3px solid #fff;
      background: #0f172a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.24);
    ">${point.groupCount}</div>
  `;
}

function getNaverClusterMarkerHtml(cluster: PropertyMapCluster) {
  return `
    <div style="
      width: 48px;
      height: 48px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.95);
      background: #03c75a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(3, 199, 90, 0.28);
    ">${cluster.groupCount}</div>
  `;
}
