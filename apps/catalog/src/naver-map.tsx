import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { useEffect, useRef, useState } from "react";
import {
  Layers,
  Minus,
  Plus,
  LocateFixed,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { money, transactions, type Bounds, type MapPoint } from "./model";

// The SDK is provided by NAVER at runtime; its dynamic constructors are isolated here.
type SDK = Record<string, any>;
declare global {
  interface Window {
    naver?: { maps: SDK };
    navermap_authFailure?: () => void;
  }
}
let authFailed = false;
let sdkPromise: Promise<SDK> | null = null;
function loadMaps() {
  const key = import.meta.env.VITE_NAVER_MAPS_NCP_KEY_ID;
  if (!key)
    return Promise.reject(
      new Error("지도를 준비하고 있습니다. 잠시 후 다시 방문해 주세요."),
    );
  if (authFailed)
    return Promise.reject(
      new Error(
        "네이버 지도 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
      ),
    );
  if (window.naver?.maps?.Map) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SDK>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "catalog-naver-map";
    let finished = false;
    const finish = (error?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        script.remove();
        reject(new Error(error));
      } else if (window.naver?.maps?.Map) resolve(window.naver.maps);
      else reject(new Error("지도를 불러오지 못했습니다."));
    };
    const timer = window.setTimeout(
      () => finish("지도 연결이 지연되고 있습니다. 다시 시도해 주세요."),
      15000,
    );
    window.navermap_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event("catalog-map-auth-failure"));
      finish("지도 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
    };
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () =>
      finish("지도를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
export function NaverMap({
  points,
  selectedSiteId,
  onSelect,
  onBounds,
  focus,
  demo,
}: {
  points: MapPoint[];
  selectedSiteId?: string;
  onSelect: (point: MapPoint) => void;
  onBounds: (bounds: Bounds) => void;
  focus?: { lat: number; lng: number; key: string };
  demo: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    sdk = useRef<SDK | null>(null);
  const callbacks = useRef({ onSelect, onBounds });
  callbacks.current = { onSelect, onBounds };
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [attempt, setAttempt] = useState(0),
    [satellite, setSatellite] = useState(false);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let idle: any;
    setReady(false);
    setError("");
    const authenticationFailed = () => {
      observer?.disconnect();
      setReady(false);
      setError(
        "네이버 지도 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    };
    window.addEventListener("catalog-map-auth-failure", authenticationFailed);
    loadMaps()
      .then((api) => {
        if (disposed || !element.current) return;
        sdk.current = api;
        const instance = new api.Map(element.current, {
          center: new api.LatLng(
            demo ? 37.555 : 37.5665,
            demo ? 127.155 : 126.978,
          ),
          zoom: demo ? 14 : 12,
          minZoom: 7,
          maxZoom: 20,
          mapDataControl: false,
          scaleControl: true,
          logoControl: true,
          logoControlOptions: { position: api.Position.BOTTOM_LEFT },
          zoomControl: false,
        });
        map.current = instance;
        const report = () => {
          const b = instance.getBounds(),
            sw = b.getSW(),
            ne = b.getNE();
          callbacks.current.onBounds({
            south: sw.lat(),
            north: ne.lat(),
            west: sw.lng(),
            east: ne.lng(),
          });
        };
        idle = api.Event.addListener(instance, "idle", report);
        observer = new ResizeObserver(() => {
          if (element.current)
            instance.setSize(
              new api.Size(
                element.current.clientWidth,
                element.current.clientHeight,
              ),
            );
        });
        observer.observe(element.current);
        if (!authFailed) setReady(true);
        report();
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      window.removeEventListener(
        "catalog-map-auth-failure",
        authenticationFailed,
      );
      observer?.disconnect();
      if (!authFailed) {
        if (idle) sdk.current?.Event.removeListener(idle);
        map.current?.destroy();
      }
      map.current = null;
    };
  }, [attempt, demo]);
  useEffect(() => {
    if (!ready || !sdk.current || !map.current) return;
    const api = sdk.current;
    const markers = points.map((point) => {
      const button = document.createElement("button");
      button.className = `price-pin ${selectedSiteId === point.siteId ? "selected" : ""}`;
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${point.name}, ${point.count}개 매물 보기`,
      );
      const label = document.createElement("span");
      label.className = "pin-name";
      label.textContent = point.name;
      const value = document.createElement("strong");
      value.textContent =
        point.transactionType === "mixed"
          ? `매물 ${point.count}개`
          : `${point.transactionType === "monthly" ? "보증금" : (transactions[point.transactionType] ?? "")} ${money(point.minPrice)}`;
      const count = document.createElement("span");
      count.className = "pin-count";
      count.textContent = `${point.count}개`;
      button.append(label, value, count);
      const marker = new api.Marker({
        position: new api.LatLng(point.lat, point.lng),
        map: map.current,
        icon: { content: button, anchor: new api.Point(62, 66) },
        zIndex: selectedSiteId === point.siteId ? 100 : 10,
      });
      const listener = api.Event.addListener(marker, "click", () =>
        callbacks.current.onSelect(point),
      );
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          callbacks.current.onSelect(point);
        }
      });
      return { marker, listener };
    });
    return () => {
      if (authFailed) return;
      markers.forEach(({ marker, listener }) => {
        api.Event.removeListener(listener);
        marker.setMap(null);
      });
    };
  }, [points, ready, selectedSiteId]);
  useEffect(() => {
    if (ready && focus && sdk.current) {
      map.current.setCenter(new sdk.current.LatLng(focus.lat, focus.lng));
      if (map.current.getZoom() < 15) map.current.setZoom(15);
    }
  }, [focus, ready]);
  useEffect(() => {
    if (ready && sdk.current)
      map.current.setMapTypeId(
        satellite ? sdk.current.MapTypeId.HYBRID : sdk.current.MapTypeId.NORMAL,
      );
  }, [satellite, ready]);
  const recenter = () => {
    if (!sdk.current || !map.current) return;
    map.current.setCenter(
      new sdk.current.LatLng(demo ? 37.555 : 37.5665, demo ? 127.155 : 126.978),
    );
    map.current.setZoom(demo ? 14 : 12);
  };
  return (
    <section className="map-area" aria-label="네이버 매물 지도">
      <div className="naver-canvas" ref={element} />
      {!ready && (
        <div className="map-state" role={error ? "alert" : "status"}>
          <Empty className="flex-none max-w-sm">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPin />
              </EmptyMedia>
              <EmptyTitle>
                {error
                  ? "지도를 불러올 수 없습니다"
                  : "네이버 지도를 불러오고 있습니다"}
              </EmptyTitle>
              <EmptyDescription>
                {error
                  ? "매물 목록에서 상세 정보는 계속 확인할 수 있어요. 잠시 후 다시 시도해 주세요."
                  : "주변 매물의 위치를 준비하고 있어요."}
              </EmptyDescription>
            </EmptyHeader>
            {error && (
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() =>
                    authFailed
                      ? window.location.reload()
                      : setAttempt((v) => v + 1)
                  }
                >
                  <RefreshCw data-icon="inline-start" />
                  다시 시도
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </div>
      )}
      {ready && (
        <>
          <div className="map-style">
            <ToggleGroup
              type="single"
              aria-label="지도 종류"
              value={satellite ? "satellite" : "normal"}
              onValueChange={(v) => {
                if (v) setSatellite(v === "satellite");
              }}
            >
              <ToggleGroupItem value="normal">일반지도</ToggleGroupItem>
              <ToggleGroupItem value="satellite">
                <Layers data-icon="inline-start" />
                위성지도
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="map-tools">
            <Button
              variant="outline"
              size="icon"
              aria-label="시작 지역으로 이동"
              onClick={recenter}
            >
              <LocateFixed data-icon="inline-start" />
            </Button>
            <div>
              <Button
                variant="outline"
                size="icon"
                aria-label="지도 확대"
                onClick={() => map.current.setZoom(map.current.getZoom() + 1)}
              >
                <Plus data-icon="inline-start" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="지도 축소"
                onClick={() => map.current.setZoom(map.current.getZoom() - 1)}
              >
                <Minus data-icon="inline-start" />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
