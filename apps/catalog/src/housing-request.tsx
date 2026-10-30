import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowUpRight, Check, MapPin, X, Send, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConsumerAuth } from "./consumer-auth";
const api = import.meta.env.VITE_API_BASE_URL ?? "/api";
type Region = { code: string; label: string };
type Receipt = {
  id: string;
  regionLabel: string;
  recipientCount: number;
  createdAt: string;
};
const examples: Region[] = [
  { code: "1174010100", label: "서울특별시 강동구 명일동" },
  { code: "1174010200", label: "서울특별시 강동구 고덕동" },
  { code: "1174010300", label: "서울특별시 강동구 상일동" },
];
export function HousingRequest({
  open,
  onOpenChange,
  demo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demo: boolean;
}) {
  const auth = useConsumerAuth();
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [history, setHistory] = useState<Receipt[]>([]);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!open || !auth.signedIn || demo) return;
    let active = true;
    auth
      .token()
      .then((token) =>
        fetch(`${api}/public/requests`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .then((r) => {
        if (!r.ok) throw Error("요청 내역을 불러오지 못했습니다.");
        return r.json();
      })
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, auth.signedIn, demo]);
  useEffect(() => {
    if (region || query.trim().length < 2) {
      setRegions([]);
      return;
    }
    if (demo) {
      setRegions(examples.filter((r) => r.label.includes(query.trim())));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${api}/public/request-regions?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw Error("지역을 불러오지 못했습니다.");
          return r.json();
        })
        .then(setRegions)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, region, demo]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!region) {
      setError("검색 결과에서 희망 지역을 선택해 주세요.");
      return;
    }
    if (!demo && !auth.signedIn) {
      setError(
        auth.configured
          ? "로그인 후 요청을 보낼 수 있습니다."
          : "로그인 연결을 준비 중입니다. 지금은 요청을 보낼 수 없습니다.",
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      if (demo) {
        setReceipt({
          id: "demo",
          regionLabel: region.label,
          recipientCount: 0,
          createdAt: new Date().toISOString(),
        });
        return;
      }
      const token = await auth.token();
      const res = await fetch(`${api}/public/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId: requestId.current,
          wardCode: region.code,
          transactionType: data.get("transactionType"),
          propertyType: data.get("propertyType"),
          budgetMax: Number(data.get("budgetMax")),
          requirements: data.get("requirements"),
          contactName: data.get("contactName"),
          phone: data.get("phone"),
          consent: data.get("consent") === "on",
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw Error(
          Array.isArray(body.message)
            ? body.message.join(" ")
            : (body.message ?? "요청을 보내지 못했습니다."),
        );
      setReceipt(body);
      requestId.current = crypto.randomUUID();
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="request-overlay" />
        <Dialog.Content className="request-dialog">
          <Dialog.Close asChild>
            <Button
              className="request-close"
              variant="ghost"
              size="icon"
              aria-label="요청 창 닫기"
            >
              <X />
            </Button>
          </Dialog.Close>
          <div className="request-intro">
            <span className="request-icon">
              <Send size={22} />
            </span>
            <Dialog.Title>찾는 집을 알려주세요.</Dialog.Title>
            <Dialog.Description>
              원하는 지역과 조건을 남기면,
              <br />그 동네를 잘 아는 중개사가 함께 찾아드려요.
            </Dialog.Description>
            <div className="request-process">
              <p>
                <MapPin size={16} /> 희망하는 동네를 선택하고
              </p>
              <p>
                <Check size={16} /> 예산과 꼭 필요한 조건을 적으면
              </p>
              <p>
                <ArrowUpRight size={16} /> 해당 지역 중개사에게 요청이 전달돼요
              </p>
            </div>
            <p className="request-footnote">
              선택한 동의 단지를 취급하는 제휴 중개사에게 전달됩니다. 중개사가
              남겨주신 연락처로 상담을 안내합니다.
            </p>
            {demo && (
              <p className="demo-label">데모 체험 · 실제 전송되지 않습니다</p>
            )}
          </div>
          <div className="request-body">
            {receipt ? (
              <div className="request-success" role="status">
                <Check size={32} />
                <h2>{demo ? "요청 화면을 체험했어요" : "요청을 전달했어요"}</h2>
                <p>{receipt.regionLabel}</p>
                <p>
                  {demo
                    ? "실제 중개사에게 전송하거나 연락처를 저장하지 않았습니다."
                    : `${receipt.recipientCount}개 사무소에 전달했습니다. 중개사가 연락처로 상담을 안내합니다.`}
                </p>
                <Button onClick={() => onOpenChange(false)}>
                  매물 계속 둘러보기
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReceipt(null);
                    setRegion(null);
                    setQuery("");
                  }}
                >
                  새 요청 작성
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="request-form">
                <h2>어떤 공간을 찾으세요?</h2>
                <label htmlFor="request-region">
                  희망 지역
                  <Input
                    id="request-region"
                    placeholder="동 이름 검색 (예: 고덕동)"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setRegion(null);
                    }}
                    required
                    aria-label="희망 지역"
                    maxLength={60}
                  />
                </label>
                {regions.length > 0 && (
                  <div className="region-options">
                    {regions.map((r) => (
                      <Button
                        key={r.code}
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setRegion(r);
                          setQuery(r.label);
                          setRegions([]);
                        }}
                      >
                        <MapPin size={14} />
                        {r.label}
                      </Button>
                    ))}
                  </div>
                )}
                {region && (
                  <span className="region-selected">
                    <Check size={14} /> 지역 선택 완료
                  </span>
                )}
                <div className="request-grid">
                  <label htmlFor="request-transactionType">
                    거래 유형
                    <Select name="transactionType" defaultValue="sale">
                      <SelectTrigger id="request-transactionType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="sale">매매</SelectItem>
                          <SelectItem value="jeonse">전세</SelectItem>
                          <SelectItem value="monthly">월세</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                  <label htmlFor="request-propertyType">
                    매물 종류
                    <Select name="propertyType" defaultValue="apartment">
                      <SelectTrigger id="request-propertyType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="apartment">아파트</SelectItem>
                          <SelectItem value="officetel">오피스텔</SelectItem>
                          <SelectItem value="villa">빌라</SelectItem>
                          <SelectItem value="house">단독·다가구</SelectItem>
                          <SelectItem value="commercial">상가</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <label htmlFor="request-budgetMax">
                  최대 예산 / 보증금 (만원)
                  <Input
                    id="request-budgetMax"
                    name="budgetMax"
                    type="number"
                    min="1"
                    max="1000000000"
                    step="1"
                    placeholder="예: 50000 = 5억원"
                    required
                  />
                </label>
                <label>
                  꼭 필요한 조건
                  <textarea
                    name="requirements"
                    required
                    minLength={10}
                    maxLength={2000}
                    placeholder="예: 2인 가구, 방 2개 이상, 역 도보 10분 이내. 12월 입주 희망. 월세라면 월 임대료 예산도 적어주세요."
                    rows={3}
                  />
                </label>
                <div className="request-grid">
                  <label htmlFor="request-contactName">
                    이름
                    <Input
                      id="request-contactName"
                      name="contactName"
                      required
                      maxLength={50}
                      autoComplete="name"
                    />
                  </label>
                  <label htmlFor="request-phone">
                    연락처
                    <Input
                      id="request-phone"
                      name="phone"
                      required
                      type="tel"
                      pattern={"[0-9+\\- ]{8,25}"}
                      autoComplete="tel"
                      placeholder="010-0000-0000"
                    />
                  </label>
                </div>
                <label className="consent" htmlFor="request-consent">
                  <Input
                    id="request-consent"
                    type="checkbox"
                    name="consent"
                    required
                    className="size-4 shrink-0"
                  />{" "}
                  선택 지역 중개사에게 이름·연락처·요청 조건을 제공하고 상담
                  연락을 받는 데 동의합니다.
                </label>
                {error && (
                  <p role="alert" className="request-error">
                    {error}
                  </p>
                )}
                {!demo && !auth.signedIn ? (
                  <>
                    <Button
                      type="button"
                      disabled={!auth.ready || !auth.configured}
                      onClick={auth.login}
                    >
                      로그인하고 요청하기
                    </Button>
                    {!auth.configured && (
                      <p className="request-footnote">
                        로그인 연결을 준비 중입니다. 요청 전송은 아직 이용할 수
                        없습니다.
                      </p>
                    )}
                  </>
                ) : (
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? "전달 중…"
                      : demo
                        ? "요청 미리보기"
                        : "이 지역 중개사에게 요청 보내기"}
                    <ArrowUpRight size={16} />
                  </Button>
                )}
                {history.length > 0 && (
                  <section className="request-history">
                    <h3>
                      <Clock3 size={16} /> 내 요청 내역
                    </h3>
                    {history.map((r) => (
                      <p key={r.id}>
                        {r.regionLabel}
                        <span>
                          {new Date(r.createdAt).toLocaleDateString("ko-KR")} ·{" "}
                          {r.recipientCount}곳 전달
                        </span>
                      </p>
                    ))}
                  </section>
                )}
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
