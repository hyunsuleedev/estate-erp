import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, Pencil, Phone, Star, Trash2 } from 'lucide-react';
import type { ServiceVendor } from '@estate-erp/api-client';
import {
  SERVICE_CATEGORY_LABEL,
  type ServiceCategory,
} from '@estate-erp/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { AD_TIER_META } from './-vendor-utils';

export interface VendorColumnCtx {
  myOfficeId: string | undefined;
  isPlatformAdmin: boolean;
  onToggleFavorite: (id: string) => void;
  onEdit: (v: ServiceVendor) => void;
  onDelete: (v: ServiceVendor) => void;
}

export function buildVendorColumns(
  ctx: VendorColumnCtx,
): ColumnDef<ServiceVendor, unknown>[] {
  const columns: ColumnDef<ServiceVendor, unknown>[] = [];

  // 1. 즐겨찾기
  columns.push({
    id: 'favorite',
    header: '',
    size: 40,
    enableResizing: false,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx.onToggleFavorite(v.id);
          }}
          className={cn(
            'flex items-center justify-center transition-transform hover:scale-110',
            v.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/60',
          )}
          aria-label={v.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >
          <Star
            className={cn('size-5', v.isFavorite && 'fill-yellow-400')}
            strokeWidth={1.5}
          />
        </button>
      );
    },
  });

  // 2. 업체 유형 배지
  columns.push({
    id: 'type',
    header: '유형',
    size: 100,
    cell: ({ row }) => {
      const v = row.original;
      const isMine = v.officeId === ctx.myOfficeId;
      return (
        <div className="flex flex-col gap-1">
          {isMine ? (
            <Badge
              variant="outline"
              className="w-fit bg-emerald-50 text-emerald-700 text-[10px]"
            >
              내 업체
            </Badge>
          ) : v.adTier !== 'none' ? (
            <Badge
              className={cn('w-fit text-[10px]', AD_TIER_META[v.adTier].className)}
            >
              {AD_TIER_META[v.adTier].label}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="w-fit text-[10px] text-muted-foreground"
            >
              공용
            </Badge>
          )}
          {v.isVerified && (
            <Badge
              variant="outline"
              className="w-fit gap-1 text-[10px] text-blue-600"
            >
              <BadgeCheck className="size-3" />
              검증
            </Badge>
          )}
        </div>
      );
    },
  });

  // 3. 업체명 (+태그)
  columns.push({
    id: 'name',
    header: '업체명',
    size: 220,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[13px] font-medium">{v.name}</span>
            {v.tags.slice(0, 2).map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="shrink-0 px-1 py-0 text-[9px] text-muted-foreground"
              >
                {t}
              </Badge>
            ))}
            {v.tags.length > 2 && (
              <span className="shrink-0 text-[9px] text-muted-foreground/70">
                +{v.tags.length - 2}
              </span>
            )}
          </span>
          {v.description && (
            <span className="truncate text-[11px] text-muted-foreground">
              {v.description}
            </span>
          )}
        </div>
      );
    },
  });

  // 4. 카테고리
  columns.push({
    id: 'categories',
    header: '서비스',
    size: 240,
    cell: ({ row }) => {
      const cats = row.original.serviceCategories;
      if (cats.length === 0)
        return <span className="text-xs text-muted-foreground">-</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {cats.slice(0, 3).map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {SERVICE_CATEGORY_LABEL[c as ServiceCategory] ?? c}
            </Badge>
          ))}
          {cats.length > 3 && (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              +{cats.length - 3}
            </Badge>
          )}
        </div>
      );
    },
  });

  // 5. 담당자/전화 (tel: 바로 걸기)
  columns.push({
    id: 'contacts',
    header: '담당자',
    size: 200,
    cell: ({ row }) => {
      const contacts = row.original.vendorContacts;
      if (contacts.length === 0)
        return <span className="text-xs text-muted-foreground">-</span>;
      const main = contacts[0];
      return (
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-[12px]">
            {main.name}
            {main.role && (
              <span className="ml-1 text-muted-foreground">· {main.role}</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <a
              href={`tel:${main.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"
              title="전화 걸기"
            >
              <Phone className="size-3" />
              {formatPhone(main.phone)}
            </a>
            {contacts.length > 1 && (
              <span className="text-muted-foreground/70">
                외 {contacts.length - 1}명
              </span>
            )}
          </span>
        </div>
      );
    },
  });

  // 6. 가격 메모
  columns.push({
    id: 'price',
    header: '단가 메모',
    size: 200,
    cell: ({ row }) => (
      <span className="truncate text-[12px]">
        {row.original.priceNote ?? (
          <span className="text-muted-foreground">-</span>
        )}
      </span>
    ),
  });

  // 7. 메모 / 즐겨찾기 메모
  columns.push({
    id: 'memo',
    header: '메모',
    size: 280,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 text-[11px]">
        {row.original.favoriteMemo && (
          <span className="truncate text-amber-700">
            ★ {row.original.favoriteMemo}
          </span>
        )}
        {row.original.memo && (
          <span className="truncate text-muted-foreground">
            {row.original.memo}
          </span>
        )}
        {!row.original.favoriteMemo && !row.original.memo && (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
    ),
  });

  // 8. 액션
  columns.push({
    id: 'actions',
    header: '',
    size: 80,
    enableResizing: false,
    cell: ({ row }) => {
      const v = row.original;
      const canEdit =
        v.officeId === ctx.myOfficeId ||
        (v.officeId === null && ctx.isPlatformAdmin);
      if (!canEdit) return null;
      return (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="xs"
            variant="ghost"
            onClick={() => ctx.onEdit(v)}
            title="수정"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-red-600"
            onClick={() => ctx.onDelete(v)}
            title="삭제"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      );
    },
  });

  return columns;
}
