import { useNavigate } from '@tanstack/react-router';
import {
  Building2Icon,
  FileTextIcon,
  HandshakeIcon,
  MapPinIcon,
  TagIcon,
  UserIcon,
} from 'lucide-react';
import type { ElementType } from 'react';

import { cn } from '@/lib/utils';

export type EntityChipKind = 'contact' | 'property' | 'listing' | 'deal' | 'contract' | 'site';

const KIND_ICON: Record<EntityChipKind, ElementType> = {
  contact: UserIcon,
  property: Building2Icon,
  listing: TagIcon,
  deal: HandshakeIcon,
  contract: FileTextIcon,
  site: MapPinIcon,
};

export interface EntityChipProps {
  kind: EntityChipKind;
  /** 해당 엔티티 id (listing이면 listing id) */
  id: string;
  /** 표시할 이름/요약 (예: "김집주인", "래미안고덕 101동 1503호") */
  label: string;
  /** 보조 텍스트 (예: "010-1234-5678", "매매 15억") */
  sublabel?: string;
  /** kind="listing"일 때 상세 이동에 사용할 propertyId (없으면 매물장 목록으로 이동) */
  propertyId?: string;
  className?: string;
}

/**
 * 컨텍스트 연결 칩 — 클릭 시 해당 엔티티 상세로 점프.
 * 상세 라우트: contact → /contacts/$id, property/listing → /properties/$id.
 * 전용 상세 라우트가 아직 없는 deal/contract/site는 각 목록 페이지로 이동한다.
 */
export function EntityChip({ kind, id, label, sublabel, propertyId, className }: EntityChipProps) {
  const navigate = useNavigate();
  const Icon = KIND_ICON[kind];

  const handleClick = () => {
    switch (kind) {
      case 'contact':
        void navigate({ to: '/contacts/$id', params: { id } });
        break;
      case 'property':
        void navigate({ to: '/properties/$id', params: { id } });
        break;
      case 'listing':
        if (propertyId) {
          void navigate({ to: '/properties/$id', params: { id: propertyId } });
        } else {
          void navigate({ to: '/properties' });
        }
        break;
      case 'deal':
        void navigate({ to: '/deals' });
        break;
      case 'contract':
        void navigate({ to: '/contracts' });
        break;
      case 'site':
        void navigate({ to: '/sites' });
        break;
    }
  };

  return (
    <button
      type="button"
      data-slot="entity-chip"
      onClick={handleClick}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-1.5 text-xs transition-colors hover:bg-accent',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate font-medium text-foreground">{label}</span>
      {sublabel && <span className="truncate text-muted-foreground">{sublabel}</span>}
    </button>
  );
}
