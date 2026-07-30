import type { AgentActionRequest } from "@estate-erp/api-client";

export type AgentActionInboxView = "review" | "ready" | "attention" | "archive";

export type AgentActionTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "destructive";

export interface AgentActionStatusMeta {
  label: string;
  tone: AgentActionTone;
}

export interface AgentActionDiffRow {
  key: string;
  label: string;
  kind: "money" | "status";
  before: number | string | null;
  after: number | string | null;
  changed: boolean;
}

export const AGENT_ACTION_INBOX_VIEWS: Array<{
  value: AgentActionInboxView;
  label: string;
}> = [
  { value: "review", label: "검토 대기" },
  { value: "ready", label: "실행 대기" },
  { value: "attention", label: "확인 필요" },
  { value: "archive", label: "보관함" },
];

export function getAgentActionInboxView(
  request: AgentActionRequest,
): AgentActionInboxView {
  if (
    request.escalationTaskId ||
    request.executionStatus === "needs_input" ||
    request.executionStatus === "failed" ||
    request.verificationStatus === "mismatch" ||
    request.verificationStatus === "not_found" ||
    request.verificationStatus === "blocked"
  ) {
    return "attention";
  }

  if (request.reviewStatus === "pending") return "review";

  if (
    request.reviewStatus === "approved" &&
    ["not_started", "awaiting_manual", "queued", "running"].includes(
      request.executionStatus,
    )
  ) {
    return "ready";
  }

  return "archive";
}

export function getAgentActionStatusMeta(
  request: AgentActionRequest,
  now: Date = new Date(),
): AgentActionStatusMeta {
  if (
    request.reviewStatus === "pending" &&
    isAgentActionEvidenceExpired(request, now)
  ) {
    return { label: "근거 만료", tone: "warning" };
  }

  if (request.executionStatus === "needs_input") {
    return { label: "직원 확인 필요", tone: "warning" };
  }
  if (
    request.executionStatus === "failed" ||
    request.verificationStatus === "mismatch"
  ) {
    return { label: "결과 불일치", tone: "destructive" };
  }
  if (request.verificationStatus === "not_found") {
    return { label: "대상 없음", tone: "warning" };
  }
  if (request.verificationStatus === "blocked") {
    return { label: "실행 중단", tone: "warning" };
  }
  if (request.executionStatus === "succeeded") {
    return { label: "적용 확인", tone: "success" };
  }

  switch (request.reviewStatus) {
    case "pending":
      return { label: "검토 대기", tone: "info" };
    case "approved":
      if (request.executionStatus === "running") {
        return { label: "실행 중", tone: "info" };
      }
      if (request.executionStatus === "queued") {
        return { label: "실행 예약", tone: "info" };
      }
      return { label: "승인됨 · 실행 대기", tone: "success" };
    case "rejected":
      return { label: "반려", tone: "destructive" };
    case "withdrawn":
      return { label: "철회", tone: "neutral" };
    case "expired":
      return { label: "만료", tone: "warning" };
    case "stale":
      return { label: "근거 변경됨", tone: "warning" };
    case "superseded":
      return { label: "새 요청으로 대체", tone: "neutral" };
    default:
      return { label: request.reviewStatus, tone: "neutral" };
  }
}

export function getAgentActionCapabilityLabel(capability: string): string {
  switch (capability) {
    case "advertisement.takedown":
      return "광고 내림";
    case "advertisement.terms.set":
      return "가격 조건 변경";
    default:
      return capability;
  }
}

export function getAgentActionDiff(
  request: AgentActionRequest,
): AgentActionDiffRow[] {
  const state = getObservedState(request);
  const payload = asRecord(request.payload);

  if (request.capability === "advertisement.takedown") {
    const isActive = readBoolean(state.isActive) ?? true;
    return [
      {
        key: "status",
        label: "광고 상태",
        kind: "status",
        before: isActive ? "게재중" : "종료",
        after: "종료",
        changed: isActive,
      },
    ];
  }

  const rows: Array<{
    key: string;
    label: string;
    beforeKey: string;
    afterKey: string;
  }> = [
    {
      key: "price",
      label: "매매가",
      beforeKey: "price",
      afterKey: "advertisedPrice",
    },
    {
      key: "deposit",
      label: "보증금",
      beforeKey: "deposit",
      afterKey: "advertisedDeposit",
    },
    {
      key: "monthlyRent",
      label: "월세",
      beforeKey: "monthlyRent",
      afterKey: "advertisedMonthlyRent",
    },
  ];

  const termRows: AgentActionDiffRow[] = rows.map((row) => {
    const before = readNullableNumber(state[row.beforeKey]);
    const after = readNullableNumber(payload[row.afterKey]);
    return {
      key: row.key,
      label: row.label,
      kind: "money",
      before,
      after,
      changed: before !== after,
    };
  });
  if (payload.republishAfterSave === true) {
    termRows.push({
      key: "republish",
      label: "재광고",
      kind: "status",
      before: "유지",
      after: "저장 후 바로 재광고",
      changed: true,
    });
  }
  return termRows;
}

export function getAgentActionSourceLocation(
  request: AgentActionRequest,
): string {
  const location = asRecord(getComparisonEvidence(request).location);
  const values = [
    location.site,
    location.dong,
    location.floor,
    location.ho,
    location.type,
  ].filter(
    (value): value is string =>
      typeof value === "string" && Boolean(value.trim()),
  );

  return Array.from(new Set(values)).join(" · ") || "내 광고";
}

export function getAgentActionArticleNo(request: AgentActionRequest): string {
  const comparison = asRecord(getComparisonEvidence(request).state);
  const mainAdvertisement = asRecord(comparison.mainAdvertisement);
  return String(
    mainAdvertisement.articleNo ??
      request.listingAdvertisement?.naverArticleNo ??
      asRecord(request.payload).articleNo ??
      "—",
  );
}

export function getAgentActionSourceUrl(
  request: AgentActionRequest,
): string | null {
  const comparison = asRecord(getComparisonEvidence(request).state);
  const mainAdvertisement = asRecord(comparison.mainAdvertisement);
  return typeof mainAdvertisement.sourceUrl === "string"
    ? mainAdvertisement.sourceUrl
    : null;
}

export function getAgentActionObservedStatus(
  request: AgentActionRequest,
): boolean | null {
  const target = getObservedState(request);
  return readBoolean(target.isActive);
}

export function getAgentActionNaverRanking(
  request: AgentActionRequest,
): string {
  const comparison = asRecord(getComparisonEvidence(request).state);
  const mainAdvertisement = asRecord(comparison.mainAdvertisement);
  const ranking = readNullableNumber(mainAdvertisement.ranking);
  const totalCount =
    readNullableNumber(mainAdvertisement.sameAddrCnt) ??
    inferAdvertisementCount(comparison.advertisements);

  return ranking == null
    ? "확인 불가"
    : `${ranking}/${totalCount ?? "?"}위`;
}

export function getAgentActionFloorExposure(
  request: AgentActionRequest,
): string {
  const comparison = asRecord(getComparisonEvidence(request).state);
  const mainAdvertisement = asRecord(comparison.mainAdvertisement);
  const floorInfo =
    typeof mainAdvertisement.floorInfo === "string" &&
    mainAdvertisement.floorInfo.trim()
      ? mainAdvertisement.floorInfo.trim()
      : null;
  const mode = mainAdvertisement.floorExposureMode;

  if (mode === "exact") return `${floorInfo ?? "층 정보"} · 정확한 층`;
  if (mode === "band") return `${floorInfo ?? "층 정보"} · 구간 노출`;
  return floorInfo ?? "확인 불가";
}

export function requestMatchesAgentActionSearch(
  request: AgentActionRequest,
  query: string,
): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;

  const haystack = normalizeSearchText(
    [
      request.title,
      request.summary,
      request.rationale,
      getAgentActionCapabilityLabel(request.capability),
      getAgentActionArticleNo(request),
      getAgentActionSourceLocation(request),
      request.reviewer?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return normalized
    .split(" ")
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function isAgentActionEvidenceExpired(
  request: AgentActionRequest,
  now: Date = new Date(),
): boolean {
  const expiresAt = new Date(request.expiresAt);
  return (
    Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()
  );
}

export function canUserDecideAgentAction(
  request: AgentActionRequest,
  user: { id: string; role: string } | null | undefined,
): boolean {
  if (!user || request.reviewStatus !== "pending") return false;
  return (
    user.id === request.reviewerId ||
    user.role === "owner" ||
    user.role === "manager"
  );
}

export function getAgentActionHashFingerprint(contentHash: string): string {
  if (contentHash.length <= 16) return contentHash;
  return `${contentHash.slice(0, 8)}…${contentHash.slice(-8)}`;
}

function getObservedState(
  request: AgentActionRequest,
): Record<string, unknown> {
  for (const item of request.evidence ?? []) {
    const evidence = asRecord(item);
    if (evidence.kind !== "listing_advertisement_state") continue;
    const state = asRecord(evidence.state);
    if (Object.keys(state).length > 0) return state;
  }

  return {
    isActive: request.listingAdvertisement?.status === "active",
    price: request.listingAdvertisement?.advertisedPrice,
    deposit: request.listingAdvertisement?.advertisedDeposit,
    monthlyRent: request.listingAdvertisement?.advertisedMonthlyRent,
  };
}

function getComparisonEvidence(
  request: AgentActionRequest,
): Record<string, unknown> {
  for (const item of request.evidence ?? []) {
    const evidence = asRecord(item);
    if (evidence.kind === "office_advertisement_comparison") {
      return evidence;
    }
  }
  return {};
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function inferAdvertisementCount(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const activeCount = value.filter((item) => {
    const advertisement = asRecord(item);
    return readBoolean(advertisement.isActive) !== false;
  }).length;
  return activeCount > 0 ? activeCount : null;
}
