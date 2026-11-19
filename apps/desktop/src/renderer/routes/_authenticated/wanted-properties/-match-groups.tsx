import { useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  GitBranch,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Ruler,
  Siren,
  Tag,
  User,
} from 'lucide-react';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  formatMatchPrice,
  formatViewingEventTime,
  getBuyerRequirementSummaryParts,
  getListingAddress,
  getMatchTitle,
  getUpcomingViewingEvent,
  type MatchRowActions,
} from './-match-view-utils';
import { MatchActionsMenu, MatchProgressTrack } from './-match-board';
import {
  EditableRequirementCell,
  type RequirementEditHandler,
  type RequirementField,
  type RequirementRefreshHandler,
} from './-requirement-cells';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { ContactNameChip, RowOpenButton, StatusBadge, WonCircleIcon } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// ── 고객별 뷰: Contact → BuyerRequirement → Match ───────────────────────────
// 매물관리 표처럼 맨 위 헤더 한 줄이 칸 이름을 맡고, 고객 행은 값만 보여준다.
// 고객 · 연락처 · 매칭을 뺀 칸(희망 조건)은 매물관리 표처럼 칸에서 바로 고친다 (-requirement-cells.tsx).

/**
 * 헤더와 고객 행이 같은 값을 써서 칸이 세로로 맞는다 (선택 · 펼침 · 값 10칸).
 * 넓은 창에서 값끼리 멀어지지 않게 예산은 상한을 두고, 남는 폭은 희망 지역이 받는다.
 * 가장 좁을 때에도 머리글 이름(16px 아이콘 + 13px 글자)이 잘리지 않는 너비다.
 *
 * 입주 희망일 · 상태 · 긴급도는 필터 줄에만 있던 값을 표에서도 보이게 한 칸이고,
 * 고객 칸에는 관리단지 표와 같은 이름 배지가 들어간다 (사용자 의견 2026-11-17).
 * 칸이 늘어난 만큼 폭을 이렇게 나눴다:
 * - 왼쪽 메뉴를 편 1440px 창(본문 1184px, 세로 굴림 막대가 자리를 차지하는 Windows에서는 1169px쯤)에
 *   들어가던 폭(합 1164px)에서, 고객 칸을 넓히며 40px 늘었다 (합 1204px). 그 창에서는 표가 가로로 20px쯤 굴러간다.
 * - 고객 148px: 동그라미 + 이름 옆에, 줄에 올리면 뜨는 "열기" 버튼이 이름을 가리지 않고 놓인다
 *   (사용자 의견 2026-11-17: "이 칸을 더 늘리고 매물관리처럼 열기 버튼을 넣어 옆 패널이 열리게").
 * - 예산 최소 156px: "매매 9억 ~ 10억 5,000만" 같은 두 값 범위가 그 폭에서도 다 보인다.
 *   예산은 잘리면 숨지만 희망 지역은 줄을 바꿔 다 보이므로, 좁을 때는 희망 지역이 먼저 줄어든다.
 */
const BUYER_TABLE_COLUMNS =
  'grid grid-cols-[40px_28px_148px_122px_100px_104px_minmax(156px,200px)_minmax(140px,1fr)_106px_68px_80px_112px]';
/** 위 칸 너비의 합. 창이 이보다 좁으면 줄바꿈 대신 표 전체가 가로로 스크롤된다. */
export const BUYER_TABLE_MIN_WIDTH_CLASS = 'min-w-[1204px]';
const BUYER_TABLE_CELL = 'flex min-w-0 items-center border-r border-border px-2.5';
/** 칸에서 바로 고치는 칸. 누르는 버튼이 칸 전체를 차지하도록 여백은 버튼이 갖는다. */
const BUYER_TABLE_EDITABLE_CELL = 'flex min-w-0 border-r border-border';

const BUYER_TABLE_HEADERS = [
  { label: '고객', icon: <User /> },
  { label: '연락처', icon: <Phone /> },
  { label: '매물 유형', icon: <Tag /> },
  { label: '희망 평형', icon: <Ruler /> },
  { label: '예산', icon: <WonCircleIcon /> },
  { label: '희망 지역·단지', icon: <MapPin /> },
  { label: '입주 희망일', icon: <CalendarDays /> },
  { label: '상태', icon: <CircleDashed /> },
  { label: '긴급도', icon: <Siren /> },
  { label: '매칭', icon: <GitBranch /> },
];

/**
 * 표 머리의 칸 이름. 매물관리 표 머리(properties/index.tsx의 TableHeaderLabel)와 같은 모양이다:
 * 16px 아이콘(#8e8b86) + 13px 보통 굵기 이름, 흐린 글자.
 */
function TableHeaderLabel({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-muted-foreground">
      {icon && (
        <span aria-hidden="true" className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function BuyerMatchTableHeader({
  checked,
  onToggleAll,
}: {
  checked: boolean | 'indeterminate';
  onToggleAll: (selected: boolean) => void;
}) {
  return (
    <div
      data-buyer-table-header
      className={cn(
        BUYER_TABLE_COLUMNS,
        // 매물관리 표 머리와 같다: 회색 띠 없이 흰 바탕, 36px, 아래 선 하나
        'sticky top-0 z-20 h-9 border-b border-border bg-white',
      )}
    >
      <div className="flex items-center justify-center">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggleAll(value === true)}
          aria-label="현재 매칭 목록 전체 선택"
        />
      </div>
      <div aria-hidden="true" className="border-r border-border" />
      {BUYER_TABLE_HEADERS.map(({ label, icon }) => (
        <div key={label} className={cn(BUYER_TABLE_CELL, 'last:border-r-0')}>
          <TableHeaderLabel icon={icon} label={label} />
        </div>
      ))}
    </div>
  );
}

export function BuyerMatchGroup({
  buyerRequirement,
  matches,
  actions,
  selected,
  onSelectedChange,
  onCreateMatch,
  onEditRequirement,
  onRefreshRequirement,
  onRequirementEditingChange,
  requirementEditBlocked,
  peekOpen = false,
  onTogglePeek,
}: {
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
  actions: MatchRowActions;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  /** 이 조건으로 고정해 매칭 생성 창을 연다 */
  onCreateMatch: () => void;
  /** 넘기면 고객 · 연락처 · 매칭을 뺀 칸을 칸에서 바로 고칠 수 있다 (매물관리 표처럼) */
  onEditRequirement?: RequirementEditHandler;
  /** 저장 직전에 이 조건의 지금 값을 받아 온다 (화면이 아직 받지 못한 변경을 덮지 않게) */
  onRefreshRequirement?: RequirementRefreshHandler;
  /** 이 줄의 칸 편집기가 열리고 닫힐 때. 화면이 열려 있는 동안 이 줄을 목록에 남겨 둔다. */
  onRequirementEditingChange?: (editing: boolean) => void;
  /** 넘기면 이 줄의 칸은 저장하지 않고 이 이유를 보인다 (목록에서 빠져 남겨 둔 줄) */
  requirementEditBlocked?: string;
  /** 이 고객의 옆 상세 패널이 지금 열려 있는지 */
  peekOpen?: boolean;
  /** 넘기면 고객 칸에 매물관리 표와 같은 "열기" 버튼이 생긴다 */
  onTogglePeek?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const buyerName = buyerRequirement.contact?.name ?? '미지정';
  // 이 줄에서 열려 있는 편집기 수. 한 칸이 저장하는 동안 옆 칸을 열 수 있어서(고르면 저장하는 칸),
  // 먼저 열린 칸이 닫힐 때 "이 줄은 이제 편집 중이 아니다"라고 잘못 알리지 않게 센다.
  const openEditorsRef = useRef(0);
  const handleEditingChange = (editing: boolean) => {
    openEditorsRef.current = Math.max(0, openEditorsRef.current + (editing ? 1 : -1));
    if (editing ? openEditorsRef.current === 1 : openEditorsRef.current === 0) {
      onRequirementEditingChange?.(editing);
    }
  };
  const editCell = (field: RequirementField) =>
    onEditRequirement
      ? {
          field,
          requirement: buyerRequirement,
          owner: buyerName,
          onEdit: onEditRequirement,
          onRefresh: onRefreshRequirement,
          onEditingChange: handleEditingChange,
          blockedReason: requirementEditBlocked,
        }
      : undefined;
  // 메모 편집기가 열려 있는 동안에는, 그 사이 목록이 새로 와 메모가 비어도 메모 줄을 남긴다
  // (줄이 사라지면 고치던 입력이 함께 사라진다).
  const [memoEditorOpen, setMemoEditorOpen] = useState(false);
  const memoEdit = editCell('memo');
  // 매칭도 메모도 없으면 펼칠 내용이 없다
  const hasDetails =
    matches.length > 0 || Boolean(buyerRequirement.memo) || memoEditorOpen;
  const showMemo = expanded && (Boolean(buyerRequirement.memo) || memoEditorOpen);
  const activeCount = matches.filter((match) => {
    const stage = normalizeMatchStage(match.stage);
    return stage !== MatchStage.DEAL_CREATED && stage !== MatchStage.CLOSED;
  }).length;
  const convertedCount = matches.filter(
    (match) => normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED,
  ).length;
  const closedCount = matches.filter(
    (match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED,
  ).length;
  const requirementSummary = getBuyerRequirementSummaryParts(buyerRequirement);
  const rawBuyerPhone = buyerRequirement.contact?.phone;
  const buyerPhone = rawBuyerPhone
    ? formatPhone(rawBuyerPhone)
    : '연락처 없음';
  return (
    <section
      data-buyer-match-group
      data-match-selected={selected ? 'true' : undefined}
      aria-label={`${buyerName} 매칭 그룹`}
      className="border-b border-border bg-white"
    >
      <header
        data-buyer-summary-header
        className={cn(
          selected && 'bg-muted/50',
          expanded && matches.length > 0 && 'border-b border-border',
        )}
      >
        <div
          data-buyer-summary-row
          // group: 줄에 올리면 고객 칸의 "열기" 버튼이 뜬다 (RowOpenButton의 조건)
          className={cn(BUYER_TABLE_COLUMNS, 'min-h-10', 'group', peekOpen && 'bg-muted/50')}
        >
          <div className="flex items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => onSelectedChange(value === true)}
              aria-label={`${buyerName} 선택`}
            />
          </div>

          <div className="flex items-center justify-center border-r border-border">
            {hasDetails && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${buyerName} 매칭 ${expanded ? '접기' : '펼치기'}`}
                aria-expanded={expanded}
                className="shrink-0 text-muted-foreground"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </Button>
            )}
          </div>

          <div className={cn(BUYER_TABLE_CELL, 'relative gap-1.5')}>
            {onTogglePeek && (
              <RowOpenButton
                label={buyerName}
                current={peekOpen}
                controls="requirement-inspector"
                onToggle={onTogglePeek}
              />
            )}
            {/* 관리단지 표의 이름 칸과 같은 배지: 이름 첫 글자 동그라미 + 이름, 누르면 그 연락처를 연다.
                연락처가 연결되지 않은 조건은 누를 곳이 없으므로 이름만 적는다 */}
            {buyerRequirement.contact?.id ? (
              <span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">
                <ContactNameChip
                  contactId={buyerRequirement.contact.id}
                  name={buyerName}
                />
              </span>
            ) : (
              <p
                title={buyerName}
                className="min-w-0 truncate text-[13px] font-semibold"
              >
                {buyerName}
              </p>
            )}
          </div>

          <dl data-buyer-contact-summary className="contents">
            <BuyerRequirementSummaryItem
              label="연락처"
              value={buyerPhone}
              className="tabular-nums"
            />
          </dl>

          <dl data-buyer-requirement-summary className="contents">
            <BuyerRequirementSummaryItem
              label="매물 유형"
              value={requirementSummary.siteTypeText}
              edit={editCell('siteTypes')}
            />
            <BuyerRequirementSummaryItem
              label="희망 평형"
              value={requirementSummary.areaText}
              className="tabular-nums"
              edit={editCell('area')}
            />
            <BuyerRequirementSummaryItem
              label="예산"
              value={requirementSummary.budgetText}
              emphasized
              edit={editCell('budget')}
            />
            {/* 지역과 단지는 매칭 판단의 핵심이라 자르지 않고 줄을 바꾼다 */}
            <BuyerRequirementSummaryItem
              label="희망 지역·단지"
              value={requirementSummary.placeText}
              wrap
              edit={editCell('places')}
            />
            {/* 언제까지 · 지금 움직이는 고객인지 · 얼마나 급한지. 필터 줄의 같은 필터와 짝이 되는 칸이다 */}
            <BuyerRequirementSummaryItem
              label="입주 희망일"
              value={formatDate(buyerRequirement.moveInDate)}
              className="tabular-nums"
              muted={!buyerRequirement.moveInDate}
              edit={editCell('moveInDate')}
            />
            <BuyerRequirementSummaryItem
              label="상태"
              value={getStatusMeta('buyerStatus', buyerRequirement.status).label}
              edit={editCell('status')}
            >
              <StatusBadge kind="buyerStatus" status={buyerRequirement.status} size="sm" />
            </BuyerRequirementSummaryItem>
            <BuyerRequirementSummaryItem
              label="긴급도"
              value={getStatusMeta('buyerUrgency', buyerRequirement.urgency).label}
              edit={editCell('urgency')}
            >
              <StatusBadge kind="buyerUrgency" status={buyerRequirement.urgency} size="sm" />
            </BuyerRequirementSummaryItem>
          </dl>

          <div
            className={cn(
              BUYER_TABLE_CELL,
              'flex-wrap gap-1 border-r-0 py-1 text-[11.5px] tabular-nums',
            )}
          >
            {matches.length === 0 && (
              <>
                <span className="text-muted-foreground">매칭 없음</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${buyerName} 매칭 생성`}
                  title="매칭 생성"
                  className="text-muted-foreground"
                  onClick={onCreateMatch}
                >
                  <Plus className="size-3.5" />
                </Button>
              </>
            )}
            {activeCount > 0 && (
              <span className="rounded-md bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                진행 {activeCount}
              </span>
            )}
            {convertedCount > 0 && (
              <span className="rounded-md bg-success-soft px-1.5 py-0.5 font-medium text-success">
                거래 {convertedCount}
              </span>
            )}
            {closedCount > 0 && (
              <span className="rounded-md bg-destructive-soft px-1.5 py-0.5 font-medium text-destructive-strong">
                종료 {closedCount}
              </span>
            )}
          </div>
        </div>

        {showMemo && (
          // 78px: 고객 칸의 이름 배지가 시작하는 위치. 메모와 아래 매칭 가지를 여기에 맞춘다.
          <dl
            data-buyer-requirement-details
            className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 border-t border-border py-1.5 pl-[78px] pr-3 text-xs leading-5"
          >
            <dt className="text-muted-foreground">고객 메모</dt>
            {memoEdit ? (
              // 누르면 메모 편집기가 뜬다. 버튼의 좌우 여백(10px)만큼 당겨 글 시작 위치는 그대로 둔다.
              <dd data-buyer-expanded-memo className="-my-0.5 -ml-2.5 flex min-w-0">
                <EditableRequirementCell
                  {...memoEdit}
                  label="고객 메모"
                  valueText={buyerRequirement.memo ?? '없음'}
                  triggerClassName="rounded-[4px] py-0.5"
                  onEditingChange={(editing) => {
                    setMemoEditorOpen(editing);
                    memoEdit.onEditingChange?.(editing);
                  }}
                >
                  <span
                    className={cn(
                      'min-w-0 whitespace-pre-wrap break-words',
                      buyerRequirement.memo
                        ? 'text-foreground/80'
                        : 'text-muted-foreground/60',
                    )}
                  >
                    {buyerRequirement.memo || '메모 추가'}
                  </span>
                </EditableRequirementCell>
              </dd>
            ) : (
              <dd
                data-buyer-expanded-memo
                className="min-w-0 whitespace-pre-wrap break-words text-foreground/80"
              >
                {buyerRequirement.memo}
              </dd>
            )}
          </dl>
        )}
      </header>

      {expanded && matches.length > 0 && (
        <BuyerMatchBranchList
          matches={matches}
          actions={actions}
          className="ml-[78px]"
        />
      )}
    </section>
  );
}

export function BuyerMatchBranchList({
  matches,
  actions,
  counterparty = 'listing',
  className,
}: {
  matches: Match[];
  actions: MatchRowActions;
  counterparty?: 'listing' | 'buyer';
  className?: string;
}) {
  const sortedMatches = [...matches].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <div
      data-match-branch-list
      className={cn(
        'relative mb-3 ml-[68px] mr-3 mt-2 space-y-1 pl-12',
        className,
      )}
    >
      <span
        data-match-branch-trunk
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 bottom-0 left-0 w-px bg-border"
      />
      {sortedMatches.map((match, index) => (
        <BuyerMatchLane
          key={match.id}
          match={match}
          actions={actions}
          counterparty={counterparty}
          isLast={index === sortedMatches.length - 1}
        />
      ))}
    </div>
  );
}

function BuyerRequirementSummaryItem({
  label,
  value,
  className,
  emphasized = false,
  wrap = false,
  muted = false,
  edit,
  children,
}: {
  label: string;
  value: string;
  className?: string;
  emphasized?: boolean;
  /** 자르지 않고 줄을 바꾼다. 행 높이가 함께 늘어난다. */
  wrap?: boolean;
  /** 값이 비어 있을 때처럼 한 걸음 물러나야 하는 글자 */
  muted?: boolean;
  /** 넘기면 칸 전체가 버튼이 되고, 누르면 그 칸의 편집기가 뜬다 */
  edit?: {
    field: RequirementField;
    requirement: NonNullable<Match['buyerRequirement']>;
    owner: string;
    onEdit: RequirementEditHandler;
    onRefresh?: RequirementRefreshHandler;
    onEditingChange?: (editing: boolean) => void;
    blockedReason?: string;
  };
  /** 글자 대신 보일 것 (상태 꼬리표 등). value는 말풍선과 읽어 주는 이름으로 남는다 */
  children?: ReactNode;
}) {
  const valueClassName = cn(
    'min-w-0 text-[13px]',
    muted ? 'text-muted-foreground' : 'text-foreground',
    // 단지 이름이 글자 중간에서 끊기지 않게 띄어쓰기에서만 줄을 바꾼다
    wrap ? 'break-words break-keep py-2 leading-5' : 'truncate',
    emphasized && 'font-medium tabular-nums',
    children !== undefined && 'flex items-center',
  );

  if (edit) {
    return (
      <div className={cn(BUYER_TABLE_EDITABLE_CELL, className)}>
        <dt className="sr-only">{label}</dt>
        <dd className="flex min-w-0 flex-1">
          <EditableRequirementCell {...edit} label={label} valueText={value}>
            <span title={value} className={valueClassName}>
              {children ?? value}
            </span>
          </EditableRequirementCell>
        </dd>
      </div>
    );
  }

  return (
    <div className={cn(BUYER_TABLE_CELL, className)}>
      {/* 칸 이름은 표 헤더가 보여주므로 화면에서는 숨기고 스크린리더에만 남긴다 */}
      <dt className="sr-only">{label}</dt>
      <dd title={value} className={valueClassName}>
        {children ?? value}
      </dd>
    </div>
  );
}

function BuyerMatchLane({
  match,
  actions,
  counterparty,
  isLast,
}: {
  match: Match;
  actions: MatchRowActions;
  counterparty: 'listing' | 'buyer';
  isLast: boolean;
}) {
  const transactionType =
    counterparty === 'buyer'
      ? match.buyerRequirement?.transactionType
      : match.listing?.transactionType;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const buyerName = match.buyerRequirement?.contact?.name ?? '구매자 미상';
  const buyerPhone = match.buyerRequirement?.contact?.phone;
  const listingTitle = getMatchTitle(match);
  const counterpartyTitle = counterparty === 'buyer' ? buyerName : listingTitle;
  const counterpartyPrimaryMeta =
    counterparty === 'buyer'
      ? buyerPhone
        ? formatPhone(buyerPhone)
        : '연락처 없음'
      : formatMatchPrice(match);
  const counterpartySecondaryMeta =
    counterparty === 'buyer' ? listingTitle : getListingAddress(match.listing);
  const accessibleMatchLabel = `${buyerName} · ${listingTitle}`;
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState(match.memo ?? '');
  const saveInFlightRef = useRef(false);
  const skipBlurSaveRef = useRef(false);
  const isSavingMemo = actions.savingMemoId === match.id;

  const startMemoEdit = () => {
    skipBlurSaveRef.current = false;
    setMemoDraft(match.memo ?? '');
    setIsEditingMemo(true);
  };

  const cancelMemoEdit = () => {
    if (saveInFlightRef.current) return;
    skipBlurSaveRef.current = true;
    setMemoDraft(match.memo ?? '');
    setIsEditingMemo(false);
  };

  const saveMemo = async () => {
    if (saveInFlightRef.current) return;

    const nextMemo = memoDraft.trim();
    const currentMemo = match.memo?.trim() ?? '';
    if (nextMemo === currentMemo) {
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
      return;
    }

    saveInFlightRef.current = true;
    try {
      await actions.onSaveMemo(match, nextMemo || null);
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
    } catch {
      // 페이지 mutation이 오류를 안내하며, 입력 상태는 재시도를 위해 유지한다.
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <article
      data-match-branch
      className="relative grid gap-3 rounded-md px-2 py-2.5 hover:bg-muted/30 xl:grid-cols-[minmax(260px,0.8fr)_minmax(520px,1.6fr)_auto] xl:items-center"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      {isLast && (
        <span
          data-match-branch-end
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 bottom-0 top-[calc(50%_-_32px)] z-[1] w-0.5 bg-background"
        />
      )}
      <svg
        data-match-branch-connector
        aria-hidden="true"
        viewBox="0 0 48 64"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -left-12 top-1/2 z-[2] h-16 w-12 -translate-y-1/2 overflow-visible text-border"
      >
        <path
          d="M0 0C0 18 14 32 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-w-0 truncate text-left text-[13px] font-semibold hover:underline"
            onClick={() => actions.onOpenDetail(match.id)}
          >
            {counterpartyTitle}
          </button>
          {transactionType && (
            <StatusBadge
              kind="transactionType"
              status={transactionType}
              size="sm"
            />
          )}
          {normalizeMatchStage(match.stage) === MatchStage.CLOSED && (
            <Badge className="border-destructive/25 bg-destructive-soft text-destructive-strong">
              종료
            </Badge>
          )}
          {normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED && (
            <Badge className="border-success/25 bg-success-soft text-success">
              거래 전환
            </Badge>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium text-foreground tabular-nums">
            {counterpartyPrimaryMeta}
          </span>
          <span className="text-border">·</span>
          <span className="truncate">{counterpartySecondaryMeta}</span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <MatchProgressTrack match={match} actions={actions} />
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          {isEditingMemo ? (
            <Input
              autoFocus
              aria-label={`${accessibleMatchLabel} 매칭 메모`}
              value={memoDraft}
              placeholder="메모 입력"
              title="Enter 저장 · Esc 취소"
              className="h-7 min-w-0 flex-1 px-2 py-0 text-xs shadow-none"
              disabled={isSavingMemo}
              onChange={(event) => setMemoDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={() => {
                if (skipBlurSaveRef.current) {
                  skipBlurSaveRef.current = false;
                  return;
                }
                void saveMemo();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelMemoEdit();
                  return;
                }

                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  void saveMemo();
                }
              }}
            />
          ) : (
            <button
              type="button"
              data-match-memo-trigger
              aria-label={`${accessibleMatchLabel} 매칭 메모 편집`}
              title="클릭하여 메모 편집"
              className="group/memo flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={(event) => {
                event.stopPropagation();
                startMemoEdit();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <span
                className={cn(
                  'line-clamp-1',
                  !match.memo?.trim() && 'italic text-muted-foreground/70',
                )}
              >
                {match.memo?.trim() || '메모 추가'}
              </span>
              <Pencil
                aria-hidden="true"
                className="size-3 shrink-0 opacity-0 group-hover/memo:opacity-100 group-focus-visible/memo:opacity-100"
              />
            </button>
          )}
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 tabular-nums"
          >
            {isSavingMemo
              ? '저장 중…'
              : upcomingViewingEvent
                ? `방문 ${formatViewingEventTime(upcomingViewingEvent)}`
                : `${formatDate(match.updatedAt)} 수정`}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <MatchActionsMenu match={match} actions={actions} />
      </div>
    </article>
  );
}
