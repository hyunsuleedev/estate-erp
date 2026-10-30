import { ConsumerAuth, AccountButton } from "./consumer-auth";
import { HousingRequest } from "./housing-request";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  Heart,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Building2,
  Phone,
  Share2,
  Map as MapIcon,
  List,
  ArrowUpRight,
  ImageOff,
  ArrowLeft,
} from "lucide-react";
import { NaverMap } from "./naver-map";
import { demoHomes } from "./demo";
import {
  area,
  filterHomes,
  initialFilters,
  mapPoints,
  money,
  price,
  queryString,
  siteTypes,
  transactions,
  type Bounds,
  type Filters,
  type Home,
  type MapPoint,
  type MapResults,
  type Results,
} from "./model";
import "./style.css";
const api = import.meta.env.VITE_API_BASE_URL ?? "/api";
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${api}/public/${path}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 404
          ? "광고가 종료되었거나 찾을 수 없는 매물입니다."
          : "매물을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
      { status: response.status },
    );
  return response.json();
}
function Photo({ home, index = 0 }: { home: Home; index?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [home.id, index]);
  return home.photoUrls[index] && !failed ? (
    <img
      src={home.photoUrls[index]}
      alt={
        home.id.startsWith("demo-")
          ? "가상 아파트 예시 이미지"
          : `${home.title} 사진 ${index + 1}`
      }
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="no-photo">
      <ImageOff data-icon="inline-start" />
      <span>등록된 사진 없음</span>
    </div>
  );
}
function HeartButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      className={cn("heart-button", active && "saved")}
      size="icon"
      aria-label={`${label} 관심 매물 ${active ? "해제" : "저장"}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <Heart data-icon="inline-start" fill={active ? "currentColor" : "none"} />
    </Button>
  );
}
function HomeCard({
  home,
  active,
  saved,
  onSelect,
  onSave,
  demo,
  showPyeong,
}: {
  home: Home;
  showPyeong: boolean;
  active: boolean;
  saved: boolean;
  onSelect: () => void;
  onSave: () => void;
  demo: boolean;
}) {
  const l = home.listing,
    s = l.property.site,
    a = area(home);
  return (
    <article className={cn("home-card", active && "active")}>
      <button
        className="card-main"
        onClick={onSelect}
        aria-label={`${s.name} ${transactions[l.transactionType]} ${price(home)} 상세 보기`}
      >
        <div className="card-heading">
          <span>{siteTypes[s.type] ?? s.type}</span>
        </div>
        <h2>{s.name}</h2>
        <strong className="card-price">
          <span>{transactions[l.transactionType]}</span> {price(home)}
        </strong>
        <p className="card-facts">
          {a == null
            ? "면적 문의"
            : `전용 ${showPyeong ? `${(a * 0.3025).toFixed(1)}평` : `${a}m²`}`}
          <span>·</span>
          {l.property.unit?.floor == null
            ? "층수 문의"
            : `${l.property.unit.floor}층`}
        </p>
        <p className="card-description">{home.title}</p>
        <div className="card-photo">
          <Photo home={home} />
        </div>
      </button>
      <HeartButton active={saved} onClick={onSave} label={s.name} />
      <div className="card-bottom">
        <span>
          {demo
            ? "예시 광고"
            : l.intake.lastVerifiedAt
              ? `${new Date(l.intake.lastVerifiedAt).toLocaleDateString("ko-KR")} 확인`
              : "확인일 미등록"}
        </span>
        <span>
          <Building2 data-icon="inline-start" />
          {home.office.name.replace(" · 예시", "")}
        </span>
      </div>
    </article>
  );
}
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || "all"}
      onValueChange={(v) => onChange(v === "all" ? "" : v)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" collisionPadding={16}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value || "all"}
              value={option.value || "all"}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
function RangeFilter({
  label,
  min,
  max,
  onApply,
  unit,
  presets,
}: {
  label: string;
  min: string;
  max: string;
  onApply: (min: string, max: string) => void;
  unit: string;
  presets: [string, string, string][];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [lo, setLo] = useState(min),
    [hi, setHi] = useState(max),
    [error, setError] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setLo(min);
          setHi(max);
          setError("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={min || max ? "secondary" : "outline"}>
          {label}
          {min || max ? " · 설정" : ""}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`${label} 범위 설정`}
        collisionPadding={16}
        align="start"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (lo && hi && Number(lo) > Number(hi)) {
              setError("최소값을 최대값 이하로 입력해 주세요.");
              return;
            }
            onApply(lo, hi);
            setOpen(false);
          }}
        >
          <PopoverHeader>
            <PopoverTitle>{label} 범위</PopoverTitle>
            <PopoverDescription>
              {label === "가격"
                ? "매매·전세 가격 / 월세 보증금 기준"
                : "전용면적 기준"}{" "}
              · {unit}
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="flex-row gap-3">
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-min`}>최소</FieldLabel>
              <Input
                id={`${id}-min`}
                type="number"
                min="0"
                max={label === "가격" ? 1000000000 : 100000}
                step="any"
                value={lo}
                onChange={(e) => setLo(e.target.value)}
                placeholder="제한 없음"
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-max`}>최대</FieldLabel>
              <Input
                id={`${id}-max`}
                type="number"
                min="0"
                max={label === "가격" ? 1000000000 : 100000}
                step="any"
                value={hi}
                onChange={(e) => setHi(e.target.value)}
                placeholder="제한 없음"
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            {presets.map(([name, l, h]) => (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                key={name}
                onClick={() => {
                  setLo(l);
                  setHi(h);
                  setError("");
                }}
              >
                {name}
              </Button>
            ))}
          </div>
          {error && (
            <FieldError id={`${id}-error`} role="alert">
              {error}
            </FieldError>
          )}
          <Button type="submit">적용하기</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
function Detail({
  home,
  loading,
  error,
  onClose,
  saved,
  onSave,
  demo,
  showPyeong,
}: {
  home: Home | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  saved: boolean;
  onSave: () => void;
  demo: boolean;
  showPyeong: boolean;
}) {
  const [index, setIndex] = useState(0),
    [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setIndex(0);
    setNotice("");
    heading.current?.focus();
  }, [home?.id]);
  const share = async () => {
    if (!home) return;
    const url = `${location.origin}${demo ? "/demo?home=" : "/homes/"}${home.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("매물 링크를 복사했습니다.");
    } catch {
      setNotice(`공유 링크: ${url}`);
    }
  };
  return (
    <section className="detail-panel" aria-label="광고 상세">
      <div className="detail-toolbar">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft data-icon="inline-start" />
          목록으로
        </Button>
        <div>
          {home && (
            <>
              <HeartButton
                active={saved}
                onClick={onSave}
                label={home.listing.property.site.name}
              />
              <Button
                variant="ghost"
                aria-label="매물 링크 복사"
                onClick={share}
              >
                <Share2 data-icon="inline-start" />
              </Button>
            </>
          )}
          <Button variant="ghost" aria-label="상세 닫기" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="empty-state" role="status">
          매물 정보를 불러오는 중…
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          {error}
        </div>
      ) : (
        home && (
          <>
            <div className="detail-scroll">
              <div className="detail-cover">
                <Photo home={home} index={index} />
                {demo && (
                  <span className="image-disclosure">
                    AI 생성 예시 이미지 · 실제 매물 사진 아님
                  </span>
                )}
                {home.photoUrls.length > 1 && (
                  <div className="photo-controls">
                    <Button
                      variant="ghost"
                      aria-label="이전 사진"
                      onClick={() =>
                        setIndex(
                          (i) =>
                            (i - 1 + home.photoUrls.length) %
                            home.photoUrls.length,
                        )
                      }
                    >
                      <ChevronLeft data-icon="inline-start" />
                    </Button>
                    <span>
                      {index + 1} / {home.photoUrls.length}
                    </span>
                    <Button
                      variant="ghost"
                      aria-label="다음 사진"
                      onClick={() =>
                        setIndex((i) => (i + 1) % home.photoUrls.length)
                      }
                    >
                      <ChevronRight data-icon="inline-start" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="detail-body">
                <div className="detail-eyeline">
                  <Badge variant="secondary">
                    {transactions[home.listing.transactionType]}
                  </Badge>
                  <span>{siteTypes[home.listing.property.site.type]}</span>
                  {demo && <span>예시 광고</span>}
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  {home.listing.property.site.name}
                </h1>
                <strong className="detail-price">{price(home)}</strong>
                <p className="detail-address">
                  <MapPin data-icon="inline-start" />
                  {home.listing.property.site.roadAddress ?? "소재지 문의"}
                </p>
                <div className="key-facts">
                  <div>
                    <span>전용면적</span>
                    <strong>
                      {area(home) == null
                        ? "문의"
                        : showPyeong
                          ? `${(area(home)! * 0.3025).toFixed(1)}평`
                          : `${area(home)}m²`}
                    </strong>
                  </div>
                  <div>
                    <span>해당층</span>
                    <strong>
                      {home.listing.property.unit?.floor == null
                        ? "문의"
                        : `${home.listing.property.unit.floor}층`}
                    </strong>
                  </div>
                  <div>
                    <span>관리비</span>
                    <strong>{money(home.listing.maintenanceFee)}</strong>
                  </div>
                </div>
                <section>
                  <h2>매물 소개</h2>
                  <h3>{home.title}</h3>
                  <p className="description">
                    {home.description ||
                      "자세한 내용은 중개사에게 문의해 주세요."}
                  </p>
                </section>
                <section>
                  <h2>거래 정보</h2>
                  <dl className="specs">
                    <div>
                      <dt>거래 유형</dt>
                      <dd>{transactions[home.listing.transactionType]}</dd>
                    </div>
                    <div>
                      <dt>입주 가능일</dt>
                      <dd>
                        {home.listing.moveInAvailableType === "immediate"
                          ? "즉시 입주"
                          : home.listing.moveInAvailableFrom
                            ? new Date(
                                home.listing.moveInAvailableFrom,
                              ).toLocaleDateString("ko-KR")
                            : "중개사 협의"}
                      </dd>
                    </div>
                    <div>
                      <dt>최근 확인일</dt>
                      <dd>
                        {home.listing.intake.lastVerifiedAt
                          ? new Date(
                              home.listing.intake.lastVerifiedAt,
                            ).toLocaleDateString("ko-KR")
                          : "확인일 미등록"}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="broker">
                  <div className="broker-icon">
                    <Building2 data-icon="inline-start" />
                  </div>
                  <div>
                    <h2>{home.office.name}</h2>
                    <p>대표 {home.office.ceoName ?? "미등록"}</p>
                    <p>등록번호 {home.office.licenseNo ?? "미등록"}</p>
                    <p>{home.office.address}</p>
                  </div>
                </section>
                <p className="detail-note">
                  거래 가능 여부와 매물의 상세 조건은 중개사에게 확인해 주세요.
                </p>
                {notice && (
                  <p className="share-notice" role="status">
                    {notice}
                  </p>
                )}
              </div>
            </div>
            <div className="contact-bar">
              {home.office.phone ? (
                <a
                  className="primary"
                  href={`tel:${home.office.phone.replace(/[^+0-9]/g, "")}`}
                >
                  <Phone data-icon="inline-start" />
                  중개사에게 문의 · {home.office.phone}
                </a>
              ) : (
                <span>
                  <Phone data-icon="inline-start" />
                  {demo
                    ? "예시 광고는 문의할 수 없습니다"
                    : "등록된 문의 전화가 없습니다"}
                </span>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}
function App() {
  const [requestOpen, setRequestOpen] = useState(false);
  const [parts] = useState(() => location.pathname.split("/").filter(Boolean));
  const demo = parts[0] === "demo";
  const officeId = parts[0] === "offices" ? parts[1] : undefined;
  const originalHome =
    parts[0] === "homes"
      ? parts[1]
      : new URLSearchParams(location.search).get("home");
  const [filters, setFilters] = useState<Filters>({
    ...initialFilters,
    officeId,
  });
  const [search, setSearch] = useState("");
  const [showPyeong, setShowPyeong] = useState(false);
  const lastLocatedSearch = useRef("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Results>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 24,
  });
  const [pins, setPins] = useState<MapResults>({
    items: [],
    total: 0,
    truncated: false,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [bounds, setBounds] = useState<Bounds>();
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    key: string;
  }>();
  const [selected, setSelected] = useState<string | null>(originalHome);
  const [detail, setDetail] = useState<Home | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState("");
  const [mode, setMode] = useState<"map" | "saved">("map");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const key = demo ? "estait-demo-favorites" : "estait-ad-favorites";
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(value)
        ? value.filter((v: unknown) => typeof v === "string").slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (id: string) =>
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [id, ...prev].slice(0, 100);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  const update = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };
  const selectHome = (home: Home) => {
    setSelected(home.id);
    history.replaceState(
      {},
      "",
      demo ? `/demo?home=${home.id}` : `/homes/${home.id}`,
    );
  };
  const closeDetail = () => {
    document.title = "estait 부동산 · 지도에서 매물 찾기";
    setSelected(null);
    history.replaceState(
      {},
      "",
      demo ? "/demo" : officeId ? `/offices/${officeId}` : "/",
    );
  };
  useEffect(() => {
    const handler = () => {
      const p = location.pathname.split("/");
      setSelected(
        p[1] === "homes"
          ? p[2]
          : new URLSearchParams(location.search).get("home"),
      );
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const open = document.querySelector("details[open]");
        if (open) {
          open.removeAttribute("open");
          return;
        }
        if (selected) closeDetail();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (demo || mode === "saved") {
        const source = demo
          ? demoHomes
          : (
              await Promise.all(
                favorites.map((id) =>
                  get<Home>(
                    `homes/${encodeURIComponent(id)}`,
                    controller.signal,
                  ).catch((error) => {
                    if (error.status === 404) return null;
                    throw error;
                  }),
                ),
              )
            ).filter((v): v is Home => v !== null);
        const list = filterHomes(
          mode === "saved"
            ? source.filter((h) => favorites.includes(h.id))
            : source,
          { ...filters, ...(mode === "saved" ? { bounds: undefined } : {}) },
        );
        return {
          results: {
            items: list.slice((page - 1) * 24, page * 24),
            total: list.length,
            page,
            pageSize: 24,
          },
          pins: {
            items: mapPoints(list),
            total: list.length,
            truncated: false,
          },
        };
      }
      const query = queryString(filters, page);
      const [r, m] = await Promise.all([
        get<Results>(
          officeId ? `offices/${officeId}?${query}` : `homes?${query}`,
          controller.signal,
        ),
        get<MapResults>(`map?${query}`, controller.signal),
      ]);
      return { results: r, pins: m };
    };
    load()
      .then((value) => {
        if (active) {
          setResults(value.results);
          setPins(value.pins);
          if (filters.search !== lastLocatedSearch.current) {
            lastLocatedSearch.current = filters.search;
            const first = value.pins.items[0];
            if (filters.search && first)
              setFocus({
                lat: first.lat,
                lng: first.lng,
                key: `search:${filters.search}`,
              });
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setResults({ items: [], total: 0, page: 1, pageSize: 24 });
          setPins({ items: [], total: 0, truncated: false });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [demo, officeId, filters, page, retry, mode, favorites]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDetail(null);
    setDetailError("");
    if (!selected) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    (demo
      ? Promise.resolve(demoHomes.find((h) => h.id === selected) ?? null)
      : get<Home>(`homes/${encodeURIComponent(selected)}`, controller.signal)
    )
      .then((home) => {
        if (!active) return;
        if (!home) {
          setDetailError("매물을 찾을 수 없습니다.");
          return;
        }
        setDetail(home);
        document.title = `${home.listing.property.site.name} · 에스테잇 부동산`;
        const s = home.listing.property.site;
        if (s.lat != null && s.lng != null)
          setFocus({ lat: Number(s.lat), lng: Number(s.lng), key: home.id });
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, demo]);
  const chooseSite = (point: MapPoint) => {
    update({ siteId: point.siteId, bounds: undefined, search: "" });
    setSearch("");
    setFocus({
      lat: point.lat,
      lng: point.lng,
      key: `${point.siteId}-${Date.now()}`,
    });
    setMobileView("list");
  };
  const reset = () => {
    setFilters({ ...initialFilters, officeId });
    setSearch("");
    setPage(1);
  };
  const searchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    update({ search: search.trim(), bounds: undefined, siteId: undefined });
    setMobileView("list");
  };
  return (
    <div
      className={cn(
        "app",
        "catalog-redesign",
        selected && "has-detail",
        `mobile-${mobileView}`,
      )}
    >
      <header className="topbar">
        <a className="brand" href={demo ? "/demo" : "/"}>
          <span className="brand-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M5 19V8l7-4 7 4v11M5 12l7-4 7 4M12 8v12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-wordmark">estait</span>
          <span className="brand-descriptor">부동산</span>
        </a>
        <form className="search-form" onSubmit={searchSubmit}>
          <InputGroup>
            <InputGroupInput
              aria-label="지역 또는 단지명 검색"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="지역, 단지명으로 찾아보세요"
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              {search && (
                <InputGroupButton
                  size="icon-xs"
                  aria-label="검색어 지우기"
                  onClick={() => {
                    setSearch("");
                    update({ search: "" });
                  }}
                >
                  <X />
                </InputGroupButton>
              )}
              <InputGroupButton type="submit" variant="secondary" size="sm">
                검색
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <nav aria-label="주요 메뉴">
          <Button
            variant="ghost"
            className={cn(mode === "map" && "current")}
            onClick={() => {
              setMode("map");
              setPage(1);
            }}
          >
            매물 둘러보기
          </Button>
          <Button
            variant="ghost"
            className={cn(mode === "saved" && "current")}
            onClick={() => {
              setMode("saved");
              setPage(1);
              setMobileView("list");
            }}
          >
            <Heart data-icon="inline-start" />
            관심 매물{favorites.length > 0 && <small>{favorites.length}</small>}
          </Button>
        </nav>
        <div className="header-end">
          <Button
            className="request-trigger"
            size="sm"
            onClick={() => setRequestOpen(true)}
          >
            매물 찾기 요청 <ArrowUpRight size={14} />
          </Button>
          <AccountButton onUnavailable={() => setRequestOpen(true)} />
        </div>
      </header>
      <div className="categorybar">
        <ToggleGroup
          type="single"
          value={filters.siteType || "all"}
          onValueChange={(value) => {
            if (value) {
              update({ siteType: value === "all" ? "" : value });
              setMode("map");
            }
          }}
          variant="navigation"
          aria-label="매물 종류"
          spacing={2}
        >
          {[
            ["all", "전체"],
            ["apartment", "아파트"],
            ["officetel", "오피스텔"],
            ["villa", "빌라"],
            ["house", "단독·다가구"],
            ["commercial", "상가"],
            ["land", "토지"],
            ["living_accommodation", "생활숙박"],
          ].map(([value, label]) => (
            <ToggleGroupItem value={value} key={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="category-caption">중개사가 직접 등록한 매물</span>
      </div>
      <div className="filterbar">
        <div className="filter-controls">
          <FilterSelect
            label="거래 유형"
            value={filters.transactionType}
            onChange={(transactionType) =>
              update({ transactionType, sort: "latest" })
            }
            options={[
              { value: "", label: "전체 거래" },
              ...Object.entries(transactions).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <RangeFilter
            label="가격"
            min={filters.priceMin}
            max={filters.priceMax}
            unit="만원"
            onApply={(priceMin, priceMax) => update({ priceMin, priceMax })}
            presets={[
              ["5억 이하", "", "50000"],
              ["5~10억", "50000", "100000"],
              ["10~20억", "100000", "200000"],
            ]}
          />
          <RangeFilter
            label="면적"
            min={filters.areaMin}
            max={filters.areaMax}
            unit="m²"
            onApply={(areaMin, areaMax) => update({ areaMin, areaMax })}
            presets={[
              ["60m² 이하", "", "60"],
              ["60~85m²", "60", "85"],
              ["85m² 이상", "85", ""],
            ]}
          />
          <Button
            variant="ghost"
            className="reset"
            aria-label="검색 조건 초기화"
            onClick={reset}
          >
            <RotateCcw data-icon="inline-start" />
            <span>초기화</span>
          </Button>
        </div>
      </div>
      <div className="workspace">
        <aside className="results-panel" aria-label="광고 매물 목록">
          <div className="results-heading">
            <div>
              <span className="eyeline">
                {mode === "saved"
                  ? "이 기기에 저장한 매물"
                  : filters.siteId
                    ? "선택한 단지"
                    : filters.search
                      ? `“${filters.search}” 검색 결과`
                      : filters.bounds
                        ? "현재 지도 영역"
                        : demo
                          ? "서울 강동구 · 예시 지역"
                          : "중개사가 등록한 광고"}
              </span>
              <h1>
                {mode === "saved"
                  ? "관심 매물"
                  : filters.siteId
                    ? (pins.items.find((p) => p.siteId === filters.siteId)
                        ?.name ?? "선택한 단지")
                    : filters.siteType
                      ? `${siteTypes[filters.siteType]} 매물`
                      : "전체 매물"}
              </h1>
            </div>
          </div>
          <div className="results-toolbar">
            <Button
              className="hidden max-[720px]:inline-flex"
              variant="ghost"
              size="sm"
              aria-pressed={mode === "saved"}
              onClick={() => {
                setMode(mode === "saved" ? "map" : "saved");
                setPage(1);
              }}
            >
              <Heart size={14} />
              관심
            </Button>
            <span>
              전체{" "}
              <strong>{loading ? "…" : results.total.toLocaleString()}</strong>
              건
            </span>
            <FilterSelect
              label="정렬"
              value={filters.sort}
              onChange={(sort) => update({ sort })}
              options={[
                { value: "latest", label: "최신순" },
                {
                  value: "priceAsc",
                  label: "가격 낮은순",
                  disabled: !filters.transactionType,
                },
                {
                  value: "priceDesc",
                  label: "가격 높은순",
                  disabled: !filters.transactionType,
                },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={showPyeong ? "제곱미터로 보기" : "평으로 보기"}
              onClick={() => setShowPyeong((v) => !v)}
            >
              {showPyeong ? "평" : "m²"}
              <RotateCcw data-icon="inline-end" />
            </Button>
          </div>
          {(filters.siteId || filters.bounds) && (
            <div className="active-region">
              <MapPin data-icon="inline-start" />
              {filters.siteId
                ? (pins.items.find((p) => p.siteId === filters.siteId)?.name ??
                  "선택한 단지")
                : "지도에서 선택한 영역"}
              <Button
                variant="ghost"
                aria-label="지역 선택 해제"
                onClick={() => update({ siteId: undefined, bounds: undefined })}
              >
                <X size={14} />
              </Button>
            </div>
          )}
          {demo && (
            <div className="demo-notice">
              <Badge variant="outline">예시</Badge>매물·금액·사진은 가상
              정보입니다.
            </div>
          )}
          <div className="results-scroll" aria-busy={loading}>
            {error ? (
              <div className="empty-state" role="alert">
                <Building2 data-icon="inline-start" />
                <h2>광고를 불러올 수 없어요</h2>
                <p>{error}</p>
                <Button
                  variant="default"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  다시 시도
                </Button>
                {!demo && (
                  <a href="/demo">
                    예시 화면 둘러보기 <ArrowUpRight data-icon="inline-start" />
                  </a>
                )}
              </div>
            ) : loading ? (
              <div className="loading-cards" role="status">
                <span className="sr-only">매물 검색 중</span>
                {[0, 1, 2].map((i) => (
                  <div className="loading-row" key={i}>
                    <div className="flex flex-1 flex-col gap-3">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="size-24" />
                  </div>
                ))}
              </div>
            ) : results.items.length ? (
              results.items.map((home) => (
                <HomeCard
                  key={home.id}
                  home={home}
                  showPyeong={showPyeong}
                  demo={demo}
                  active={selected === home.id}
                  saved={favorites.includes(home.id)}
                  onSelect={() => selectHome(home)}
                  onSave={() => toggleFavorite(home.id)}
                />
              ))
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>
                    {mode === "saved"
                      ? "관심 매물을 모아보세요"
                      : "조건에 맞는 매물이 없습니다"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {mode === "saved"
                      ? "매물의 하트를 눌러 저장하고 비교해 보세요."
                      : "지역이나 가격 범위를 바꿔 다시 찾아보세요."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={reset}>
                    검색 조건 초기화
                  </Button>
                </EmptyContent>
              </Empty>
            )}
            {results.total > 24 && (
              <nav className="pagination" aria-label="매물 페이지">
                <Button
                  variant="ghost"
                  disabled={page === 1}
                  aria-label="이전 페이지"
                  onClick={() => setPage((v) => v - 1)}
                >
                  <ChevronLeft data-icon="inline-start" />
                </Button>
                <span>
                  {page} / {Math.ceil(results.total / 24)}
                </span>
                <Button
                  variant="ghost"
                  disabled={page * 24 >= results.total}
                  aria-label="다음 페이지"
                  onClick={() => setPage((v) => v + 1)}
                >
                  <ChevronRight data-icon="inline-start" />
                </Button>
              </nav>
            )}
            <footer className="list-footer">
              <span className="mini-brand">estait</span>
              <p>매물 정보는 등록 중개사에게 확인해 주세요.</p>
              <small>매물 정보는 광고를 등록한 중개사가 제공합니다.</small>
            </footer>
          </div>
        </aside>
        <div className="map-shell">
          <NaverMap
            points={pins.items}
            selectedSiteId={detail?.listing.property.site.id ?? filters.siteId}
            onSelect={chooseSite}
            onBounds={setBounds}
            focus={focus}
            demo={demo}
          />
          <div className="map-top-left">
            <span>
              <MapPin data-icon="inline-start" />
              {demo ? "서울시 강동구" : "지도에서 지역 찾기"}
            </span>
            {mode !== "saved" && (
              <Button
                variant="ghost"
                disabled={!bounds}
                onClick={() => {
                  update({ bounds, siteId: undefined, search: "" });
                  setSearch("");
                }}
              >
                <RotateCcw data-icon="inline-start" />이 지도에서 검색
              </Button>
            )}
          </div>
          <div className="map-bottom-note">
            <span className="legend-dot" />
            광고 매물
            {pins.truncated ? (
              <span>최대 500개 표시 · 지도를 확대해 주세요</span>
            ) : (
              <span>{pins.items.length}개 단지</span>
            )}
            {demo && <span>가상 위치</span>}
          </div>
        </div>
        {selected && (
          <Detail
            showPyeong={showPyeong}
            home={detail}
            loading={detailLoading}
            error={detailError}
            onClose={closeDetail}
            saved={favorites.includes(selected)}
            onSave={() => toggleFavorite(selected)}
            demo={demo}
          />
        )}
      </div>
      <HousingRequest
        open={requestOpen}
        onOpenChange={setRequestOpen}
        demo={demo}
      />
      {!selected && (
        <Button
          variant="default"
          className="mobile-view-toggle hidden max-[720px]:inline-flex"
          onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
        >
          {mobileView === "map" ? (
            <List data-icon="inline-start" />
          ) : (
            <MapIcon data-icon="inline-start" />
          )}
          {mobileView === "map" ? `목록 보기 · ${results.total}` : "지도 보기"}
        </Button>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ConsumerAuth>
    <App />
  </ConsumerAuth>,
);
