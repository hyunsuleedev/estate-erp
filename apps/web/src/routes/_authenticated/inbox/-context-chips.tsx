import { useNavigate } from '@tanstack/react-router';
import { ListChecks } from 'lucide-react';
import { EntityChip } from '@/components/domain';
import { cn } from '@/lib/utils';

/**
 * 업무함 항목의 관련 엔티티 점프 칩 묶음.
 * EntityDraft / Proposal 공용 — id 가 있는 항목만 렌더한다.
 */
export function ContextChips({
  listingId,
  propertyId,
  contactId,
  dealId,
  contractId,
  className,
}: {
  listingId?: string | null;
  propertyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  contractId?: string | null;
  className?: string;
}) {
  const hasAny = listingId || propertyId || contactId || dealId || contractId;
  if (!hasAny) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-[11px] text-muted-foreground">관련:</span>
      {contactId && <EntityChip kind="contact" id={contactId} label="연락처" />}
      {propertyId && (
        <EntityChip kind="property" id={propertyId} label="관리 매물" />
      )}
      {listingId && (
        <EntityChip
          kind="listing"
          id={listingId}
          propertyId={propertyId ?? undefined}
          label="매물"
        />
      )}
      {dealId && <EntityChip kind="deal" id={dealId} label="거래" />}
      {contractId && (
        <EntityChip kind="contract" id={contractId} label="계약" />
      )}
    </div>
  );
}

/**
 * 실행 결과 엔티티 링크 — entityType 에 따라 점프 가능한 칩 또는 안내 링크.
 * EntityChip 이 지원하지 않는 타입(task 등)은 해당 목록 페이지 링크로 대체.
 */
export function ResultEntityLink({
  entityType,
  resultEntityId,
  propertyId,
}: {
  entityType: string;
  resultEntityId: string | null;
  propertyId?: string | null;
}) {
  const navigate = useNavigate();
  if (!resultEntityId) return null;

  if (entityType === 'listing') {
    return (
      <EntityChip
        kind="listing"
        id={resultEntityId}
        propertyId={propertyId ?? undefined}
        label="생성된 매물"
      />
    );
  }
  if (entityType === 'property') {
    return <EntityChip kind="property" id={resultEntityId} label="생성된 매물" />;
  }
  if (entityType === 'contract') {
    return <EntityChip kind="contract" id={resultEntityId} label="생성된 계약" />;
  }
  if (entityType === 'task') {
    return (
      <button
        type="button"
        onClick={() => void navigate({ to: '/tasks' })}
        className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-1.5 text-xs transition-colors hover:bg-accent"
      >
        <ListChecks className="size-3 text-muted-foreground" />
        생성된 업무 보기
      </button>
    );
  }
  return null;
}
