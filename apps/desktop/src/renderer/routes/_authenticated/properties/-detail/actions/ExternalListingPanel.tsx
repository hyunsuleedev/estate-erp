import { Link } from '@tanstack/react-router';
import { ExternalLink, Globe } from 'lucide-react';
import { SideCard } from '../cards/SideCard';

/**
 * 외부 광고노트 호실 연결 카드.
 * Phase 1: placeholder + 광고노트 페이지로 이동만.
 * 후속: 같은 호실에 매칭된 ExternalListingGroup이 있으면 자동으로 link.
 */
export function ExternalListingPanel() {
  return (
    <SideCard
      title="외부 광고"
      action={
        <Link
          to="/properties/external-listings"
          className="grid size-6 place-items-center text-muted-foreground hover:text-foreground"
          aria-label="광고노트 열기"
        >
          <ExternalLink className="size-3" />
        </Link>
      }
    >
      <div className="flex items-start gap-2 rounded border border-dashed border-border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
        <Globe className="mt-0.5 size-3.5 shrink-0" />
        <div className="leading-4">
          네이버 등에서 수집한 광고매물과 자동 연결 예정. 광고노트 페이지에서
          호실을 직접 매핑할 수 있습니다.
        </div>
      </div>
    </SideCard>
  );
}
