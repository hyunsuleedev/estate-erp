import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  BedDouble,
  Compass,
  Layers,
  MessageSquarePlus,
  Ruler,
  ArrowUp,
  ArrowUpRight,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Footprints,
  Handshake,
  Inbox,
  Loader2,
  Megaphone,
  Pencil,
  Phone,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * 매물 상세 패널 (빠른 확인·처리).
 * 머리 영역에는 주요 정보(단지·호실, 대표 가격, 상태, 작업)만 두고,
 * 나머지는 탭(요약 · 사람·상담 · 광고 · 매칭·거래 · 이력)으로 나눈다.
 * 업무 흐름은 중개 순서(확인 → 광고 → 매칭 → 거래)를 따른다.
 * 데이터 계산은 index.tsx의 PropertyInspectorContent가 하고, 이 파일은 표시만 한다.
 */

export type InspectorChipTone = "ok" | "deal" | "warn" | "neutral";
export type InspectorStepTone = "attention" | "active" | "done" | "idle";

export interface InspectorChip {
  label: string;
  tone: InspectorChipTone;
  /** 매물상태(활성·거래중·보류·종료)는 매물관리 표의 배지 색을 그대로 쓴다. 있으면 tone 대신 사용. */
  palette?: { pill: string; dot: string };
}

export interface InspectorOffer {
  id: string;
  typeLabel: string;
  typeClassName: string;
  priceText: string;
  status: InspectorChip | null;
  delta: { direction: "down" | "up"; amountText: string; dateText: string } | null;
  terms: Array<{ label: string; value: string }>;
  memo: string | null;
}

export interface InspectorStep {
  key: "confirm" | "ad" | "buyer" | "deal";
  label: string;
  value: string;
  detail: string;
  tone: InspectorStepTone;
  action?: { label: string; onClick: () => void };
}

export interface InspectorTodo {
  id: string;
  title: string;
  detail: string;
  tone: "warning" | "danger" | "neutral";
  action?: { label: string; onClick: () => void };
}

export interface InspectorPerson {
  id: string;
  name: string;
  roleLabel: string;
  isPrimary: boolean;
  phone: string | null;
  /** 화면 표시용 (010-1234-5678) */
  phoneLabel: string | null;
  detail: string | null;
}

export type InspectorActivityKind =
  | "consultation"
  | "visit"
  | "price"
  | "ad"
  | "deal"
  | "intake"
  /** "매물 확인 완료" 버튼이 남긴 확인 기록 (상담 기록으로 저장된다) */
  | "confirm";

export interface InspectorActivity {
  id: string;
  kind: InspectorActivityKind;
  dateText: string;
  /** 시각 "14:30". 상담처럼 하루에 여러 번 생기는 기록에만 둔다. */
  timeText?: string | null;
  title: string;
  who: string | null;
  text: string | null;
  quote: boolean;
  url: string | null;
}

export interface InspectorMatchRow {
  id: string;
  buyerName: string;
  stageLabel: string;
  typeLabel: string;
  dateText: string;
  closed: boolean;
}

export interface InspectorAdRow {
  id: string;
  channelLabel: string;
  active: boolean;
  priceText: string;
  periodText: string;
  url: string | null;
  memo: string | null;
}

export interface InspectorDealRow {
  id: string;
  stageLabel: string;
  typeLabel: string;
  dateText: string;
  done: boolean;
}

export interface InspectorStat {
  kind: "area" | "floor" | "room" | "direction";
  text: string;
}

export interface InspectorModel {
  siteName: string;
  dong: string | null;
  ho: string | null;
  /** 제목 아래 한 줄: 주소 · 유형 · 평형 타입 */
  subline: string[];
  /** 가격 아래 핵심 수치 (네이버·Zillow식 한 줄 요약) */
  stats: InspectorStat[];
  /** 요약 탭 "매물 정보" 칸 */
  infoFacts: Array<{ label: string; value: string }>;
  chips: InspectorChip[];
  offers: InspectorOffer[];
  steps: InspectorStep[];
  todos: InspectorTodo[];
  people: InspectorPerson[];
  activities: InspectorActivity[];
  matches: InspectorMatchRow[];
  /** 매칭 조회 상태: 실패를 "손님 없음"과 구분한다 */
  matchesStatus: "loading" | "error" | "ready";
  /** 매물·거래 조건에만 연결된 상담 조회 상태: 실패하면 일부 누락을 알린다 */
  consultationsStatus: "loading" | "error" | "ready";
  ads: InspectorAdRow[];
  deals: InspectorDealRow[];
  memo: string | null;
}

type InspectorTab = "summary" | "people" | "ads" | "progress" | "history";

const chipToneClassName: Record<InspectorChipTone, string> = {
  ok: "bg-[#e9f2ec] text-[#3f7a57] [&_[data-dot]]:bg-[#5e9a74]",
  deal: "bg-[#ece9f4] text-[#4b3f72] [&_[data-dot]]:bg-[#7d6fb0]",
  warn: "bg-[#fbf3e2] text-[#9a6516] [&_[data-dot]]:bg-[#c58a2b]",
  neutral: "bg-[#f1f0ec] text-[#5f5e5a] [&_[data-dot]]:bg-[#a9a7a1]",
};

const barButtonClassName =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0";
const barSecondaryClassName =
  "bg-white text-foreground shadow-[inset_0_0_0_1px_#e3e2de,0_1px_2px_rgba(15,15,15,0.04)] hover:bg-[#fbfaf8]";

export function PropertyInspectorView({
  model,
  onClose,
  onOpenFullPage,
  isOpeningFullPage,
  onConfirm,
  isConfirming,
  onConsult,
  onEdit,
  onAddContact,
  onRetryConsultations,
  onSaveOfferMemo,
  onSaveIntakeMemo,
  progressTab,
  dialogs,
}: {
  model: InspectorModel;
  onClose: () => void;
  onOpenFullPage: () => void;
  isOpeningFullPage: boolean;
  onConfirm: () => void;
  isConfirming: boolean;
  onConsult: () => void;
  onEdit: () => void;
  onAddContact: () => void;
  onRetryConsultations: () => void;
  /** 거래 조건(Listing) 메모 저장. 빈 문자열은 지우기. 실패하면 reject한다. */
  onSaveOfferMemo: (offerId: string, memo: string) => Promise<void>;
  /** 의뢰(ListingIntake) 메모 저장. 빈 문자열은 지우기. 실패하면 reject한다. */
  onSaveIntakeMemo: (memo: string) => Promise<void>;
  /** 매칭·거래 탭 내용 (매칭 진행 트랙·거래 흐름, index.tsx 소유) */
  progressTab: ReactNode;
  /** 패널이 여는 대화상자들 (index.tsx 소유) */
  dialogs: ReactNode;
}) {
  const [tab, setTab] = useState<InspectorTab>("summary");
  const primaryOffer = model.offers[0];
  // 요약 탭 메모: 거래 조건(매매·전세·월세)마다 하나, 의뢰 전체에 하나. 모두 그 자리에서 편집한다.
  // 같은 거래 종류가 둘 이상이면 "월세 1", "월세 2"처럼 구분한다.
  const memoLabelOf = (offer: InspectorOffer) => {
    const sameType = model.offers.filter((item) => item.typeLabel === offer.typeLabel);
    return sameType.length > 1 ? `${offer.typeLabel} ${sameType.indexOf(offer) + 1}` : offer.typeLabel;
  };
  const summaryMemos = [
    ...model.offers.map((offer) => ({
      key: offer.id,
      label: memoLabelOf(offer),
      text: offer.memo,
      onSave: (memo: string) => onSaveOfferMemo(offer.id, memo),
    })),
    { key: "intake", label: "의뢰", text: model.memo, onSave: onSaveIntakeMemo },
  ];
  const consultations = model.activities.filter(
    (activity) =>
      activity.kind === "consultation" || activity.kind === "visit" || activity.kind === "confirm",
  );
  // 탭 숫자는 지금 진행 중인 것만 센다 (게재중 광고, 열린 매칭·거래).
  const activeAdCount = model.ads.filter((ad) => ad.active).length;
  const activeProgressCount =
    model.matches.filter((match) => !match.closed).length +
    model.deals.filter((deal) => !deal.done).length;
  const tabs: Array<{ value: InspectorTab; label: string; count?: number }> = [
    { value: "summary", label: "요약" },
    {
      value: "people",
      label: "사람·상담",
      count: model.people.length + consultations.length,
    },
    { value: "ads", label: "광고", count: activeAdCount },
    { value: "progress", label: "매칭·거래", count: activeProgressCount },
    { value: "history", label: "이력", count: model.activities.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* 상단 막대 */}
      <div className="flex h-11 shrink-0 items-center gap-1 pl-6 pr-2.5">
        <span className="text-[12px] font-medium text-[#a9a7a1]">매물 상세</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="전체 페이지를 새 창으로 열기"
          disabled={isOpeningFullPage}
          onClick={onOpenFullPage}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:opacity-60"
        >
          {isOpeningFullPage ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowUpRight className="size-3.5" />
          )}
          {isOpeningFullPage ? "여는 중..." : "전체 페이지"}
        </button>
        <button
          type="button"
          aria-label="상세 패널 닫기"
          onClick={onClose}
          className="inline-grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 머리 영역: 매물 정보 (단지·호실 → 가격 → 핵심 수치 → 상태) */}
      <div className="shrink-0 px-6 pb-4">
        <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a]">
          {model.siteName}
          {(model.dong || model.ho) && (
            <span className="ml-2 whitespace-nowrap tabular-nums">
              {[model.dong && `${model.dong}동`, model.ho && `${model.ho}호`]
                .filter(Boolean)
                .join(" ")}
            </span>
          )}
        </h2>
        {model.subline.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
            {model.subline.map((item, index) => (
              <Fragment key={`${item}-${index}`}>
                {index > 0 && <span className="text-[#c9c7c1]">·</span>}
                <span>{item}</span>
              </Fragment>
            ))}
          </div>
        )}

        {/* 거래 조건(매매·전세·월세)은 모두 같은 크기로 한 줄씩. 중단·계약 중인 조건은 상태를 붙인다. */}
        <div className="mt-4 space-y-1.5">
          {primaryOffer ? (
            model.offers.map((offer) => (
              <div key={offer.id} className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11.5px] font-semibold",
                    offer.typeClassName,
                  )}
                >
                  {offer.typeLabel}
                </span>
                <Money text={offer.priceText} className="text-[20px]" />
                {offer.status && <StatusChip chip={offer.status} />}
                {offer.delta && <Delta delta={offer.delta} />}
              </div>
            ))
          ) : (
            <span className="text-[13px] text-muted-foreground">등록된 거래 조건이 없습니다</span>
          )}
        </div>

        {model.stats.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground">
            {model.stats.map((stat) => (
              <span key={stat.kind} className="inline-flex items-center gap-1.5">
                <StatIcon kind={stat.kind} />
                {stat.text}
              </span>
            ))}
          </div>
        )}

        {model.chips.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {model.chips.map((chip) => (
              <StatusChip key={chip.label} chip={chip} />
            ))}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div role="tablist" aria-label="매물 상세 구역" className="flex shrink-0 gap-5 border-b border-[#ecebe8] px-6">
        {tabs.map((item) => {
          const selected = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.value)}
              className={cn(
                "relative h-10 whitespace-nowrap text-[13px] font-medium transition-colors focus-visible:outline-none",
                selected
                  ? "text-[#2f2e2a] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {item.count ? (
                <span className="ml-1 text-[11.5px] font-medium text-[#a9a7a1]">{item.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
        {tab === "summary" && (
          <div className="space-y-7">
            {model.todos.length > 0 && (
              <section>
                <SectionTitle count={model.todos.length}>지금 할 일</SectionTitle>
                <TodoList todos={model.todos} />
              </section>
            )}

            <section>
              <SectionTitle>진행 상황</SectionTitle>
              <ol aria-label="업무 흐름" className="divide-y divide-[#f1f0ec]">
                {model.steps.map((step) => (
                  <WorkflowStep key={step.key} step={step} />
                ))}
              </ol>
            </section>

            {model.offers.length > 1 && (
              <section>
                <SectionTitle count={model.offers.length}>거래 조건</SectionTitle>
                <div className="divide-y divide-[#f1f0ec]">
                  {model.offers.map((offer) => (
                    <OfferRow key={offer.id} offer={offer} />
                  ))}
                </div>
              </section>
            )}

            {model.infoFacts.length > 0 && (
              <section>
                <SectionTitle>매물 정보</SectionTitle>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {model.infoFacts.map((fact) => (
                    <div key={fact.label} className="flex min-w-0 items-baseline gap-3">
                      <dt className="w-14 shrink-0 text-[12.5px] text-muted-foreground">{fact.label}</dt>
                      <dd
                        className={cn(
                          "min-w-0 truncate text-[13px]",
                          fact.value === "-" ? "text-[#c9c7c1]" : "font-medium text-[#2f2e2a]",
                        )}
                      >
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section>
              <SectionTitle>메모</SectionTitle>
              <dl className="space-y-1">
                {summaryMemos.map((memo) => (
                  <div key={memo.key} className="flex min-w-0 items-start gap-3">
                    <dt className="w-14 shrink-0 py-1 text-[12.5px] leading-[1.6] text-muted-foreground">
                      {memo.label}
                    </dt>
                    <dd className="min-w-0 flex-1">
                      <InlineMemoField label={memo.label} value={memo.text} onSave={memo.onSave} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}

        {tab === "people" && (
          <div className="space-y-7">
            <section>
              <SectionTitle
                count={model.people.length || undefined}
                action={<TextAction icon={<UserPlus />} label="추가" onClick={onAddContact} />}
              >
                사람
              </SectionTitle>
              {model.people.length === 0 ? (
                <EmptyText>등록된 소유주, 대리인, 세입자가 없습니다.</EmptyText>
              ) : (
                <div className="-mx-2">
                  {model.people.map((person) => (
                    <PersonRow key={person.id} person={person} />
                  ))}
                </div>
              )}
            </section>
            <section>
              <SectionTitle
                count={consultations.length || undefined}
                action={<TextAction icon={<Plus />} label="상담 기록" onClick={onConsult} />}
              >
                상담
              </SectionTitle>
              {model.consultationsStatus === "error" && (
                <RetryNote onRetry={onRetryConsultations}>일부 상담을 불러오지 못했습니다.</RetryNote>
              )}
              {consultations.length > 0 ? (
                <Timeline activities={consultations} />
              ) : model.consultationsStatus === "loading" ? (
                <EmptyText>상담을 불러오는 중…</EmptyText>
              ) : model.consultationsStatus === "ready" ? (
                <EmptyText>상담 기록이 없습니다.</EmptyText>
              ) : null}
            </section>
          </div>
        )}

        {tab === "ads" && (
          <div className="space-y-7">
            <section>
              <SectionTitle count={model.ads.length || undefined}>광고</SectionTitle>
              {model.ads.length === 0 ? (
                <EmptyText>CP 광고 기록이 없습니다.</EmptyText>
              ) : (
                <div className="divide-y divide-[#f2f1ef]">
                  {model.ads.map((ad) => (
                    <div key={ad.id} className="flex items-start gap-3 py-2.5">
                      <StatusChip chip={{ label: ad.active ? "게재중" : "종료", tone: ad.active ? "ok" : "neutral" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#2f2e2a]">
                          {ad.channelLabel}
                          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{ad.priceText}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] tabular-nums text-[#a9a7a1]">
                          {ad.periodText}
                          {ad.memo && <span className="text-muted-foreground"> · {ad.memo}</span>}
                        </div>
                      </div>
                      {ad.url && (
                        <a
                          href={ad.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${ad.channelLabel} 광고 열기`}
                          className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* 매칭·거래 탭은 데이터·동작이 많아 index.tsx가 만든 내용을 그대로 꽂는다 */}
        {tab === "progress" && progressTab}

        {tab === "history" && (
          <>
            {model.consultationsStatus === "error" && (
              <RetryNote onRetry={onRetryConsultations}>일부 상담을 불러오지 못해 이력이 빠졌을 수 있습니다.</RetryNote>
            )}
            {model.activities.length > 0 ? (
              <Timeline activities={model.activities} />
            ) : model.consultationsStatus === "loading" ? (
              <EmptyText>이력을 불러오는 중…</EmptyText>
            ) : model.consultationsStatus === "ready" ? (
              <EmptyText>상담, 가격 변경, 광고 기록이 아직 없습니다.</EmptyText>
            ) : null}
          </>
        )}
      </div>

      {/* 하단 고정 작업: 무엇을 하는지 이름으로 드러낸다 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#ecebe8] bg-white px-6 py-3">
        <button type="button" onClick={onConsult} className={cn(barButtonClassName, barSecondaryClassName)}>
          <MessageSquarePlus />
          상담 남기기
        </button>
        <button type="button" onClick={onEdit} className={cn(barButtonClassName, barSecondaryClassName)}>
          <Pencil />
          가격·상태 수정
        </button>
        <button
          type="button"
          disabled={isConfirming}
          onClick={onConfirm}
          title="소유주에게 가격과 거래 가능 여부를 확인했으면 누르세요"
          className={cn(barButtonClassName, "ml-auto bg-[#2f2e2a] px-4 text-white hover:bg-[#1f1e1b]")}
        >
          {isConfirming ? <Loader2 className="animate-spin" /> : <Check />}
          매물 확인 완료
        </button>
      </div>

      {dialogs}
    </div>
  );
}

function StatIcon({ kind }: { kind: InspectorStat["kind"] }) {
  const className = "size-3.5 text-[#a9a7a1]";
  switch (kind) {
    case "area":
      return <Ruler className={className} />;
    case "floor":
      return <Layers className={className} />;
    case "room":
      return <BedDouble className={className} />;
    case "direction":
      return <Compass className={className} />;
  }
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-[#2f2e2a]">
      {children}
      {count !== undefined && <span className="font-medium text-[#a9a7a1]">{count}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

export function TextAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3"
    >
      {icon}
      {label}
    </button>
  );
}

/** 매물관리 표의 상태 배지(StatusIndicator)와 같은 모양: 4px 모서리, 12px, 점. */
function StatusChip({ chip }: { chip: InspectorChip }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        chip.palette ? chip.palette.pill : chipToneClassName[chip.tone],
      )}
    >
      <span data-dot className={cn("size-1.5 rounded-full", chip.palette?.dot)} />
      {chip.label}
    </span>
  );
}

function Delta({ delta }: { delta: NonNullable<InspectorOffer["delta"]> }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[11.5px] font-semibold",
        delta.direction === "down" ? "bg-[#e9f2ec] text-[#3f7a57]" : "bg-[#fbe9e6] text-[#8a3b33]",
      )}
    >
      {delta.direction === "down" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
      {delta.amountText} · {delta.dateText}
    </span>
  );
}

/** "31억 9,000만" — 억·만도 숫자와 같은 크기·굵기·색으로 표시 */
function Money({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate font-bold leading-none tracking-[-0.025em] text-[#2f2e2a] tabular-nums",
        className,
      )}
    >
      {text}
    </span>
  );
}

function OfferRow({ offer }: { offer: InspectorOffer }) {
  return (
    <div className="py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11.5px] font-semibold",
            offer.typeClassName,
          )}
        >
          {offer.typeLabel}
        </span>
        <Money text={offer.priceText} className="text-[17px]" />
        {offer.status && <StatusChip chip={offer.status} />}
        {offer.delta && (
          <span className="ml-auto">
            <Delta delta={offer.delta} />
          </span>
        )}
      </div>
      {offer.terms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {offer.terms.map((term) => (
            <span key={term.label}>
              {term.label} <span className="font-medium text-foreground">{term.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 메모 칸 바로 편집 (Notion 속성 편집 방식).
 * 클릭하면 그 자리에서 입력 상자로 바뀌고, Enter·바깥 클릭이면 저장, Esc면 취소.
 * Shift+Enter는 줄바꿈. 저장하는 동안 입력한 내용을 그대로 보여준다.
 */
export function InlineMemoField({
  label,
  value,
  onSave,
  emptyText = "비어 있음",
}: {
  label: string;
  value: string | null;
  onSave: (memo: string) => Promise<void>;
  /** 비어 있을 때 보이는 글 */
  emptyText?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Enter/Esc로 닫은 직후 따라오는 blur가 한 번 더 저장하지 않도록 막는다.
  const closedRef = useRef(false);
  const restoreFocusRef = useRef(false);
  // 편집 상자가 열릴 때 포커스를 가져올지. 사용자가 연 경우에만 가져온다.
  const focusOnOpenRef = useRef(false);
  const editing = draft !== null;
  const shown = saving ?? value;

  useEffect(() => {
    if (editing) {
      if (!focusOnOpenRef.current) return;
      focusOnOpenRef.current = false;
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const startEditing = () => {
    // 저장 중에는 다시 열지 않는다. 열면 아직 갱신 전인 예전 값에서 시작하고,
    // 예전 수정 시각으로 저장해 충돌이 난다.
    if (saving !== null) return;
    closedRef.current = false;
    focusOnOpenRef.current = true;
    setFailed(false);
    setDraft(value ?? "");
  };

  const finish = (save: boolean, restoreFocus: boolean) => {
    if (closedRef.current || draft === null) return;
    closedRef.current = true;
    restoreFocusRef.current = restoreFocus;
    setFailed(false);
    const typed = draft;
    const next = typed.trim();
    setDraft(null);
    if (!save || next === (value ?? "")) return;
    setSaving(next);
    onSave(next).then(
      () => setSaving(null),
      () => {
        // 저장 실패: 오류 안내는 저장을 맡은 쪽이 한다. 입력한 글은 버리지 않고
        // 편집 상자로 되돌려 다시 저장하거나 복사할 수 있게 한다.
        // 포커스는 아무도 쓰고 있지 않을 때만 가져온다. 다른 메모를 편집 중인데
        // 포커스를 빼앗으면 그 메모가 blur로 저장되고, 그것도 실패하면 서로
        // 포커스를 뺏으며 저장을 무한히 반복한다.
        const active = document.activeElement;
        focusOnOpenRef.current =
          !active || active === document.body || active === buttonRef.current;
        setSaving(null);
        setFailed(true);
        closedRef.current = false;
        setDraft(typed);
      },
    );
  };

  if (editing) {
    return (
      <div
        data-inspector-inline-editor
        data-native-tab-discard-blocker="true"
        data-native-tab-dirty={draft !== (value ?? "") ? "true" : undefined}
      >
        <textarea
          ref={textareaRef}
          aria-label={`${label} 메모`}
          value={draft}
          rows={1}
          placeholder="메모 입력"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true, false)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finish(false, true);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              finish(true, true);
            }
          }}
          className="block min-h-[30px] w-full resize-none rounded-md bg-white px-2 py-1 text-[13px] leading-[1.6] text-[#2f2e2a] shadow-[inset_0_0_0_1px_#d9d8d4,0_0_0_3px_rgba(55,53,47,0.06)] outline-none [field-sizing:content] placeholder:text-[#a9a7a1]"
        />
        {failed && (
          <p role="alert" className="mt-1 px-2 text-[11.5px] text-[#b4423a]">
            저장하지 못했습니다. Enter로 다시 저장하거나 Esc로 취소하세요.
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={`${label} 메모 편집`}
      aria-busy={saving !== null || undefined}
      onClick={startEditing}
      className={cn(
        "block w-full rounded-md px-2 py-1 text-left text-[13px] leading-[1.6] transition-colors duration-100 focus-visible:outline-none",
        shown ? "whitespace-pre-wrap break-words text-[#2f2e2a]" : "text-[#b4b2ac]",
        saving !== null
          ? "cursor-progress opacity-60"
          : "cursor-text hover:bg-[#f4f3f0] focus-visible:bg-[#f4f3f0]",
      )}
    >
      {shown || emptyText}
    </button>
  );
}

function TodoList({ todos }: { todos: InspectorTodo[] }) {
  return (
    <div className="divide-y divide-[#f3e6c8] rounded-lg bg-[#fbf6ea] px-3">
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-center gap-2.5 py-2.5">
          <span
            className={cn(
              "grid size-[22px] shrink-0 place-items-center rounded-full bg-white",
              todo.tone === "neutral" ? "text-[#4b3f72]" : todo.tone === "danger" ? "text-[#b4423a]" : "text-[#b7791f]",
            )}
          >
            {todo.tone === "neutral" ? <Handshake className="size-3" /> : <AlertCircle className="size-3" />}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-[13px] font-semibold",
                todo.tone === "neutral" ? "text-foreground" : "text-[#5a4214]",
              )}
            >
              {todo.title}
            </span>
            <span
              className={cn(
                "mt-px block truncate text-[12px]",
                todo.tone === "neutral" ? "text-muted-foreground" : "text-[#8a7448]",
              )}
            >
              {todo.detail}
            </span>
          </span>
          {todo.action && (
            <button
              type="button"
              onClick={todo.action.onClick}
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-semibold transition-colors",
                todo.tone === "neutral"
                  ? "text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
                  : "text-[#7a5a18] hover:bg-[rgba(183,121,31,0.1)]",
              )}
            >
              {todo.action.label}
              <ChevronRight className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PersonRow({ person }: { person: InspectorPerson }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[rgba(55,53,47,0.04)]">
      <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#f1f0ec] text-[12px] font-semibold text-muted-foreground">
        {person.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-[#2f2e2a]">{person.name}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{person.roleLabel}</span>
          {person.isPrimary && (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-[#f1f0ec] px-1.5 text-[10.5px] font-semibold text-muted-foreground">
              주 연락처
            </span>
          )}
        </span>
        <span className="mt-px block truncate text-[12px] tabular-nums text-muted-foreground">
          {[person.phoneLabel ?? "전화번호 없음", person.detail].filter(Boolean).join(" · ")}
        </span>
      </span>
      {person.phone && (
        <a
          href={`tel:${person.phone}`}
          aria-label={`${person.name} 전화`}
          className="inline-grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
        >
          <Phone className="size-3.5" />
        </a>
      )}
    </div>
  );
}

const stepToneClassName: Record<InspectorStepTone, string> = {
  attention: "[&_[data-step-value]]:text-[#8a5a12] [&_[data-step-mark]]:bg-[#c58a2b]",
  active: "[&_[data-step-value]]:text-[#2f2e2a] [&_[data-step-mark]]:bg-foreground",
  done: "[&_[data-step-value]]:text-[#2f2e2a] [&_[data-step-mark]]:bg-[#5e9a74]",
  idle: "[&_[data-step-value]]:font-medium [&_[data-step-value]]:text-[#a9a7a1] [&_[data-step-mark]]:bg-[#d6d5d0]",
};

const stepIcon: Record<InspectorStep["key"], ReactNode> = {
  confirm: <CalendarCheck className="size-3" />,
  ad: <Megaphone className="size-3" />,
  buyer: <Users className="size-3" />,
  deal: <Handshake className="size-3" />,
};

function WorkflowStep({ step }: { step: InspectorStep }) {
  return (
    <li className={cn("flex min-h-10 items-center gap-3 py-2", stepToneClassName[step.tone])}>
      <span className="flex w-14 shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <span className="text-[#a9a7a1]">{stepIcon[step.key]}</span>
        {step.label}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span data-step-mark className="size-1.5 shrink-0 rounded-full" />
        <span data-step-value className="shrink-0 text-[13px] font-semibold">
          {step.value}
        </span>
        {step.detail && (
          <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{step.detail}</span>
        )}
      </span>
      {step.action && (
        <button
          type="button"
          onClick={step.action.onClick}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
        >
          {step.action.label}
          <ChevronRight className="size-3" />
        </button>
      )}
    </li>
  );
}

function Timeline({ activities }: { activities: InspectorActivity[] }) {
  return (
    <ol>
      {activities.map((activity, index) => (
        <li key={activity.id} className="grid grid-cols-[44px_24px_minmax(0,1fr)] gap-x-3 py-2">
          <span className="pt-[3px] text-right text-[12px] tabular-nums text-[#a9a7a1]">
            {activity.dateText}
            {activity.timeText && <span className="mt-0.5 block text-[11px] text-[#bdbbb5]">{activity.timeText}</span>}
          </span>
          {/* 연결선은 원 칸 안에서 원 중심(가로 50%, 세로 12px)부터 다음 원 중심까지 그린다.
              li 아래·위 여백(8px+8px)과 다음 원 반지름(12px)을 더해 -bottom-7. */}
          <div className="relative">
            {index < activities.length - 1 && (
              <span aria-hidden className="absolute -bottom-7 left-[calc(50%-0.5px)] top-3 w-px bg-[#e3e2de]" />
            )}
            <span
              className={cn(
                "relative grid size-6 place-items-center rounded-full",
                index === 0 ? "bg-foreground text-white" : "bg-white text-muted-foreground shadow-[inset_0_0_0_1px_#e3e2de]",
              )}
            >
              <ActivityIcon kind={activity.kind} />
            </span>
          </div>
          <div className="min-w-0">
            <div className="pt-[3px] text-[13px] font-medium text-[#2f2e2a]">
              {activity.url ? (
                <a
                  href={activity.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 hover:underline"
                >
                  <span className="truncate">{activity.title}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                activity.title
              )}
              {activity.who && <span className="font-normal text-muted-foreground"> · {activity.who}</span>}
            </div>
            {activity.text && (
              <p
                className={cn(
                  "mt-1 whitespace-pre-wrap text-[12.5px] leading-[1.55]",
                  activity.quote
                    ? "rounded-r-md bg-[#fbfaf8] px-2.5 py-1.5 text-foreground shadow-[inset_2px_0_0_#e3e2de]"
                    : "tabular-nums text-muted-foreground",
                )}
              >
                {activity.text}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityIcon({ kind }: { kind: InspectorActivityKind }) {
  const className = "size-3";
  switch (kind) {
    case "consultation":
      return <Phone className={className} />;
    case "visit":
      return <Footprints className={className} />;
    case "price":
      return <CircleDollarSign className={className} />;
    case "ad":
      return <Megaphone className={className} />;
    case "deal":
      return <Handshake className={className} />;
    case "intake":
      return <Inbox className={className} />;
    case "confirm":
      return <CalendarCheck className={className} />;
  }
}

/** 조회 실패 안내 + 다시 시도. 받아 둔 내용 위에 띄워 일부가 빠졌음을 알린다. */
export function RetryNote({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-[#fbf3e2] px-3 py-2.5 text-[12.5px] text-[#8a5a12] shadow-[inset_0_0_0_1px_#f0dfb8]"
    >
      {children}
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full px-2 py-1 font-semibold hover:bg-[rgba(183,121,31,0.1)]"
      >
        다시 시도
      </button>
    </div>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-[#fbfaf8] px-3 py-3 text-[12.5px] text-muted-foreground">{children}</p>;
}
