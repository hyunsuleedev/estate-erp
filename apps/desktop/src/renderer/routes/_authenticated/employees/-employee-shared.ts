import { ApiError } from '@estate-erp/api-client';
import type { Employee } from '@estate-erp/api-client';
import { USER_LICENSE_TYPE_LABELS } from '@estate-erp/shared';

/**
 * 직원관리(업무·활동 추적)와 설정 › 직원 및 권한(계정 설정)이 같이 쓰는 이름표와 계산.
 * 화면 모양은 두 곳이 각자 갖는다.
 */

export const ROLE_LABELS: Record<string, string> = {
  owner: '대표',
  manager: '매니저',
  agent: '중개사',
};

/** 역할을 설명하는 한 줄. 설정의 권한 안내와 역할을 바꿀 때 쓴다. */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: '사무소 설정과 직원 계정, 급여와 배분율까지 모두 관리합니다.',
  manager: '중개사 계정을 만들고 관리합니다. 급여와 배분율은 볼 수 없습니다.',
  agent: '본인의 업무와 정보만 봅니다.',
};

export const LICENSE_TYPE_LABELS: Record<string, string> = USER_LICENSE_TYPE_LABELS;

export const PAY_TYPE_LABELS: Record<string, string> = {
  fixed: '고정급',
  mixed: '고정급+수수료',
  commission_only: '수수료제',
};

export const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  listing_agent: '매도측 담당',
  buying_agent: '매수측 담당',
  dual_agent: '단독중개',
  manager: '관리자',
  assistant: '보조',
  closer: '마감 담당',
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export const BUYER_STATUS_LABELS: Record<string, string> = {
  active: '활성',
  matched: '활성',
  hold: '보류',
  inactive: '보류',
  completed: '완료',
};

/** 활동 기록의 대상 이름. 서버가 모델 이름을 그대로 적으므로 업무 용어로 바꾼다. */
const ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  property: '매물',
  listingIntake: '매물 의뢰',
  listing: '거래 조건',
  publicListing: '공개 매물',
  contact: '연락처',
  propertyContact: '매물 연락처',
  tenant: '세입자',
  buyerIntake: '구매 의뢰',
  buyerIntakeContact: '구매 의뢰 연락처',
  project: '프로젝트',
  projectStep: '프로젝트 순서',
  buyerRequirement: '희망조건',
  match: '매칭',
  deal: '거래',
  consultation: '상담',
  task: '업무',
  networkSharedProperty: '공유 매물',
  contract: '계약',
  contractDocument: '계약 문서',
  contractClauseTemplate: '특약 서식',
  officePrintTemplate: '인쇄 서식',
};

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
};

const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  web: '앱',
  mcp: 'AI 연결',
  system: '시스템',
};

/** "매물 의뢰 수정"처럼 읽히는 활동 한 줄. 모르는 값은 서버 값을 그대로 보인다. */
export function describeActivity(activity: { entityType: string; action: string }) {
  const entity = ACTIVITY_ENTITY_LABELS[activity.entityType] ?? activity.entityType;
  const action = ACTIVITY_ACTION_LABELS[activity.action] ?? activity.action;
  return `${entity} ${action}`;
}

export function describeActivitySource(source: string) {
  return ACTIVITY_SOURCE_LABELS[source] ?? source;
}

export function licenseLabel(licenseType: string | null) {
  return licenseType ? (LICENSE_TYPE_LABELS[licenseType] ?? licenseType) : '자격 미지정';
}

/** 지금 맡고 있는 일의 합. 목록에서 사람을 견주는 기준이다. */
export function workloadOf(employee: Employee) {
  const { counts } = employee;
  return counts.activeTaskCount + counts.activeBuyerRequirementCount + counts.activeDealCount;
}

/** 이름·아이디·연락처 어디든 들어 있으면 찾는다 */
export function matchesEmployeeSearch(employee: Employee, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [employee.name, employee.loginId, employee.email, employee.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청 처리에 실패했습니다.';
}

/** 사무소 공통 배분 기준에서 숫자 하나를 읽는다. 없거나 숫자가 아니면 기본값 */
export function getCommissionNumber(config: unknown, key: string, fallback: number) {
  if (typeof config !== 'object' || config === null) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ── 날짜 계산 (직원관리의 "지금 챙길 것"과 타임라인) ────────────────

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** 오늘 기준 며칠 남았는지. 지났으면 음수. */
export function daysUntil(value: string | Date, now: Date = new Date()) {
  const target = typeof value === 'string' ? new Date(value) : value;
  return Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
}

/** "3일 지남" · "오늘" · "내일" · "D-5" */
export function dueLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  return `D-${days}`;
}

/** 타임라인의 날짜 머리: "오늘" · "어제" · "11월 12일" (다른 해는 연도까지) */
export function dayHeading(value: string | Date, now: Date = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = daysUntil(date, now);
  if (diff === 0) return '오늘';
  if (diff === -1) return '어제';
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear() ? base : `${date.getFullYear()}년 ${base}`;
}

export function clockTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 활성 직원인데 이만큼 활동이 없으면 목록에서 알린다 */
export const QUIET_DAYS = 7;

/** 마지막 활동 뒤로 지난 날 수. 기록이 없으면 null */
export function quietDays(employee: Employee, now: Date = new Date()) {
  if (!employee.latestActivityAt) return null;
  return -daysUntil(employee.latestActivityAt, now);
}
