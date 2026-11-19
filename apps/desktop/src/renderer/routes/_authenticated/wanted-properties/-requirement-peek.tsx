/**
 * 희망매물 옆 상세 패널.
 * 매물관리 · 거래관리 · 문서관리의 상세 패널과 같은 방식으로 열린다: 표 위에 오른쪽에서 미끄러져 나오고,
 * 맨 위 줄은 같은 도구 줄(닫기 » · 새 탭으로 확장 ⤢)이다. 확장을 누르면 희망조건 전체 화면이
 * 새 탭으로 열리고 패널은 닫힌다. Esc로 닫는다.
 * 목록을 떠나지 않고 한 고객의 조건 · 연락 관리 · 메모 · 연결 매물을 한 번에 본다.
 * 속성 줄은 Notion 페이지 속성과 같은 모양(왼쪽 흐린 이름 + 오른쪽 값, 줄 높이 34px)이다.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import { PropertyInspectorToolbar } from '../properties/-components/property-inspector-view';
import {
  formatMatchPrice,
  getBuyerRequirementSummaryParts,
  getMatchTitle,
} from './-match-view-utils';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatPhone } from '@/lib/format';
import { StatusBadge } from '@/components/domain';

type Requirement = NonNullable<Match['buyerRequirement']>;

/** 매물관리 · 거래관리 패널의 Esc 규칙과 같다: 떠 있는 창 · 메뉴가 있으면 그쪽이 먼저 닫힌다 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

export const REQUIREMENT_INSPECTOR_WIDTH = 480;
export const REQUIREMENT_INSPECTOR_ID = 'requirement-inspector';

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[104px_minmax(0,1fr)] items-start gap-2 py-[6.5px]">
      <dt className="text-[14px] leading-[21px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] leading-[21px] text-foreground">
        {children}
      </dd>
    </div>
  );
}

const empty = <span className="text-muted-foreground">비어 있음</span>;

/** 값이 "-" · "—" · 빈 글이면 "비어 있음"으로 바꿔 보인다 */
function textOrEmpty(value: string | null | undefined) {
  const text = value?.trim();
  return !text || text === '-' || text === '—' ? empty : text;
}

export function RequirementPeek({
  requirement,
  matches,
  closing,
  animate,
  onClose,
  onExited,
  onOpenFull,
  onOpenMatch,
}: {
  requirement: Requirement;
  /** 이 조건에 연결된 매칭 (목록이 이미 받아 둔 것) */
  matches: Match[];
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  /** 희망조건 전체 화면을 새 탭으로 연다 */
  onOpenFull: (requirementId: string) => void;
  /** 연결 매물을 누르면 그 매칭의 상세를 연다 */
  onOpenMatch: (matchId: string) => void;
}) {
  const name = requirement.contact?.name ?? '미지정';
  const phone = requirement.contact?.phone;
  const summary = getBuyerRequirementSummaryParts(requirement);
  const memo = requirement.memo?.trim();
  // 다음 연락일이 오늘이거나 지났으면 눈에 띄게 한다 (희망조건 화면의 연락 관리와 같은 기준)
  const nextContactOverdue =
    requirement.nextContactDate != null &&
    new Date(requirement.nextContactDate).getTime() < Date.now();
  const openMatches = matches.filter(
    (match) => normalizeMatchStage(match.stage) !== MatchStage.CLOSED,
  );
  const closedCount = matches.length - openMatches.length;

  // 다른 상세 패널과 같다: 전체 화면을 열고 패널은 닫는다.
  const expand = () => {
    onOpenFull(requirement.id);
    onClose(false);
  };

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <aside
      id={REQUIREMENT_INSPECTOR_ID}
      data-requirement-peek
      data-property-inspector
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="희망매물 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)]"
      style={{ width: REQUIREMENT_INSPECTOR_WIDTH, maxWidth: '100%' }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar onClose={onClose} onOpenNewTab={expand} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3">
        <h2 className="break-keep text-[22px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">
          {name}
        </h2>

        <dl className="mt-4">
          <Property label="연락처">
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="tabular-nums underline-offset-2 hover:underline"
              >
                {formatPhone(phone)}
              </a>
            ) : (
              empty
            )}
            {requirement.contact?.id && (
              <Link
                to="/contacts/$id"
                params={{ id: requirement.contact.id }}
                className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                연락처 열기
              </Link>
            )}
          </Property>
          <Property label="상태">
            <StatusBadge kind="buyerStatus" status={requirement.status} size="sm" />
          </Property>
          <Property label="긴급도">
            <StatusBadge kind="buyerUrgency" status={requirement.urgency} size="sm" />
          </Property>
          <Property label="예산">
            <span className="font-medium tabular-nums">{textOrEmpty(summary.budgetText)}</span>
          </Property>
          <Property label="매물 유형">{textOrEmpty(summary.siteTypeText)}</Property>
          <Property label="희망 평형">
            <span className="tabular-nums">{textOrEmpty(summary.areaText)}</span>
          </Property>
          <Property label="희망 지역·단지">{textOrEmpty(summary.placeText)}</Property>
          <Property label="입주 희망일">
            {requirement.moveInDate ? (
              <span className="tabular-nums">{formatDate(requirement.moveInDate)}</span>
            ) : (
              empty
            )}
          </Property>
          <Property label="담당">{requirement.assignedTo?.name ?? empty}</Property>
          <Property label="최근 연락일">
            {requirement.lastContactDate ? (
              <span className="tabular-nums">{formatDate(requirement.lastContactDate)}</span>
            ) : (
              empty
            )}
          </Property>
          <Property label="다음 연락일">
            {requirement.nextContactDate ? (
              <>
                <span className="tabular-nums">{formatDate(requirement.nextContactDate)}</span>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    nextContactOverdue ? 'font-medium text-destructive-strong' : 'text-muted-foreground',
                  )}
                >
                  {formatDday(requirement.nextContactDate)}
                </span>
              </>
            ) : (
              empty
            )}
          </Property>
          <Property label="등록">
            <span className="tabular-nums text-muted-foreground">{formatDate(requirement.createdAt)}</span>
          </Property>
        </dl>

        <section className="mt-5 border-t border-border pt-4">
          <h3 className="text-[14px] font-semibold text-foreground">메모</h3>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[21px] text-foreground">
            {memo || empty}
          </p>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            연결 매물
            <span className="font-normal tabular-nums text-muted-foreground">{openMatches.length}</span>
          </h3>
          {openMatches.length === 0 ? (
            <p className="mt-1.5 text-[14px] text-muted-foreground">연결한 매물이 없습니다.</p>
          ) : (
            <ul className="-mx-1.5 mt-1">
              {openMatches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMatch(match.id)}
                    className="flex min-h-[30px] w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[14px] text-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{getMatchTitle(match)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatMatchPrice(match)}</span>
                    <StatusBadge kind="matchStage" status={normalizeMatchStage(match.stage)} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {closedCount > 0 && (
            <p className="mt-1.5 text-[13px] tabular-nums text-muted-foreground">종료한 매칭 {closedCount}건</p>
          )}
        </section>
      </div>
    </aside>
  );
}
