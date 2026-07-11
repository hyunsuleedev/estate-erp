import { Link } from '@tanstack/react-router';
import type { BuyerRequirement, Consultation, ContactRelation, PropertyContact } from '@estate-erp/api-client';
import { sqmToPyeong } from '@estate-erp/shared';
import { Link2, Trash2 } from 'lucide-react';
import { formatDate, formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EntityChip, StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * 연락처 상세 페이지 보조 카드/라벨/포맷 모음.
 * $id.tsx의 본문 길이를 줄이기 위해 분리한 비라우트 파일.
 */

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

const consultationTypeColors: Record<string, string> = {
  phone: 'bg-info-soft text-info',
  visit: 'bg-success-soft text-success',
  online: 'bg-violet-soft text-violet',
};

export const buyerStatusLabels: Record<string, string> = {
  active: '활성',
  matched: '매칭됨',
  completed: '완료',
  inactive: '비활성',
};

const buyerStatusColors: Record<string, string> = {
  active: 'bg-success-soft text-success',
  matched: 'bg-info-soft text-info',
  completed: 'bg-neutral-soft text-neutral-strong',
  inactive: 'bg-neutral-soft text-muted-foreground',
};

export const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

const urgencyColors: Record<string, string> = {
  urgent: 'bg-destructive-soft text-destructive',
  normal: 'bg-neutral-soft text-neutral-strong',
  flexible: 'bg-info-soft text-info',
};

export const propertyRoleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

export const relationTypeLabels: Record<string, string> = {
  parent: '부모',
  spouse: '배우자',
  child: '자녀',
  sibling: '형제자매',
  lawyer: '법무사',
  tax_agent: '세무사',
  other: '기타',
};

export function formatBudgetSummary(requirement: BuyerRequirement) {
  if (requirement.transactionType === 'monthly') {
    const deposit = formatMoneyRange(requirement.depositMin, requirement.depositMax);
    const monthly = requirement.monthlyRentMax
      ? `${formatMoney(requirement.monthlyRentMax)} 이하`
      : '협의';
    return `보증금 ${deposit} · 월세 ${monthly}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${formatMoneyRange(requirement.depositMin, requirement.depositMax)}`;
  }

  return `매매 ${formatMoneyRange(requirement.priceMin, requirement.priceMax)}`;
}

export function formatMoneyRange(min: number | null, max: number | null) {
  if (min && max) return `${formatMoney(min)} ~ ${formatMoney(max)}`;
  if (min) return `${formatMoney(min)} 이상`;
  if (max) return `${formatMoney(max)} 이하`;
  return '협의';
}

/** 면적 범위 — m²+평 병기 (단일 값 포맷은 formatArea, 범위는 여기서 처리) */
export function formatAreaSummary(requirement: BuyerRequirement) {
  const fmt = (value: number) => `${value}㎡(${sqmToPyeong(value)}평)`;
  if (!requirement.areaMin && !requirement.areaMax) return '면적 조건 없음';
  if (requirement.areaMin && requirement.areaMax) {
    return `${fmt(requirement.areaMin)} ~ ${fmt(requirement.areaMax)}`;
  }
  if (requirement.areaMin) return `${fmt(requirement.areaMin)} 이상`;
  return `${fmt(requirement.areaMax ?? 0)} 이하`;
}

export function formatRegionSummary(requirement: BuyerRequirement) {
  const regions = (requirement.preferredRegions ?? [])
    .map((region) => region.ward?.name ?? region.district?.name ?? region.province?.name ?? '')
    .filter(Boolean);
  return regions.length > 0 ? regions.join(', ') : null;
}

// ── 카드 컴포넌트 ─────────────────────────────────────────────

export function PropertyContactCard({ propertyContact }: { propertyContact: PropertyContact }) {
  const title = propertyContact.property?.site?.name ?? '연결 매물';
  const subtitle = [
    propertyContact.property?.unit?.name,
    propertyContact.property?.site?.roadAddress || propertyContact.property?.site?.jibunAddress,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {propertyContact.property ? (
            <Link
              to="/properties/$id"
              params={{ id: propertyContact.propertyId }}
              className="text-sm font-medium hover:text-primary hover:underline"
            >
              {title}
            </Link>
          ) : (
            <p className="text-sm font-medium">{title}</p>
          )}
          <p className="text-sm text-muted-foreground">{subtitle || '위치 정보 없음'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant="secondary">{propertyRoleLabels[propertyContact.role] ?? propertyContact.role}</Badge>
          {propertyContact.isPrimary && <Badge>주 연락처</Badge>}
          {propertyContact.isResident && <Badge variant="outline">거주중</Badge>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {propertyContact.shareRatio !== null && <span>지분 {propertyContact.shareRatio}%</span>}
        <span>상태 {propertyContact.status}</span>
      </div>

      {propertyContact.memo && (
        <p className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {propertyContact.memo}
        </p>
      )}
    </div>
  );
}

export function BuyerRequirementCard({ requirement }: { requirement: BuyerRequirement }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn('border-transparent', buyerStatusColors[requirement.status] ?? 'bg-neutral-soft text-neutral-strong')}>
              {buyerStatusLabels[requirement.status] ?? requirement.status}
            </Badge>
            <Badge className={cn('border-transparent', urgencyColors[requirement.urgency] ?? 'bg-neutral-soft text-neutral-strong')}>
              {urgencyLabels[requirement.urgency] ?? requirement.urgency}
            </Badge>
            {requirement.transactionType && (
              <StatusBadge kind="transactionType" status={requirement.transactionType} size="sm" />
            )}
          </div>
          <Link
            to="/buyer-requirements"
            className="block text-sm font-medium hover:text-primary hover:underline"
          >
            {formatBudgetSummary(requirement)}
          </Link>
          <p className="text-sm text-muted-foreground">
            {formatAreaSummary(requirement)}
            {(() => {
              const regions = formatRegionSummary(requirement);
              return regions ? ` · ${regions}` : '';
            })()}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>등록 {formatDate(requirement.createdAt)}</p>
          {requirement.nextContactDate && <p>다음 연락 {formatDate(requirement.nextContactDate)}</p>}
        </div>
      </div>

      {requirement.memo && (
        <p className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {requirement.memo}
        </p>
      )}
    </div>
  );
}

/** 상담 카드 — PRD: 여러 줄 내용 그대로 노출, 1줄 truncate 금지 */
export function ConsultationCard({ consultation }: { consultation: Consultation }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn('border-transparent', consultationTypeColors[consultation.type] ?? 'bg-neutral-soft text-neutral-strong')}>
          {consultationTypeLabels[consultation.type] ?? consultation.type}
        </Badge>
        {consultation.property && (
          <EntityChip
            kind="property"
            id={consultation.property.id}
            label={[
              consultation.property.site?.name ?? '매물',
              consultation.property.unit?.name,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
        {consultation.listing?.transactionType && (
          <StatusBadge kind="transactionType" status={consultation.listing.transactionType} size="sm" />
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDateTime(consultation.createdAt)}
          {consultation.createdBy?.name ? ` · ${consultation.createdBy.name}` : ''}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{consultation.content}</p>
    </div>
  );
}

export interface RelationItem {
  id: string;
  /** 관계 레코드 id (삭제용) */
  relationId: string;
  direction: '연결함' | '연결됨';
  relation: ContactRelation;
  counterpartId: string | null;
  counterpartName: string;
  counterpartPhone: string | null;
}

export function RelationCard({
  item,
  onDelete,
  deleting,
}: {
  item: RelationItem;
  onDelete: () => void;
  deleting: boolean;
}) {
  const relationLabel =
    item.relation.label || relationTypeLabels[item.relation.relationType] || item.relation.relationType;

  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline">{item.direction}</Badge>
            <Badge variant="secondary">{relationLabel}</Badge>
          </div>
          {item.counterpartId ? (
            <Link
              to="/contacts/$id"
              params={{ id: item.counterpartId }}
              className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary hover:underline"
            >
              {item.counterpartName}
              <Link2 className="size-3.5 text-muted-foreground" />
            </Link>
          ) : (
            <p className="text-sm font-medium">{item.counterpartName}</p>
          )}
          <p className="text-sm text-muted-foreground">{formatPhone(item.counterpartPhone)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="관계 삭제"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {item.relation.memo && (
        <p className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {item.relation.memo}
        </p>
      )}
    </div>
  );
}
