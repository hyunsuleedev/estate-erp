import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronUp,
  Filter,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  CreateServiceVendorDto,
  ServiceVendor,
  ServiceVendorFilter,
  UpdateServiceVendorDto,
  VendorAdTier,
  VendorContact,
} from '@estate-erp/api-client';
import {
  SERVICE_CATEGORY_LABEL,
  SERVICE_CATEGORY_ORDER,
  type ServiceCategory,
} from '@estate-erp/shared';
import { DataTable } from '@/components/data-table';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const Route = createFileRoute(
  '/_authenticated/service-vendors/',
)({
  component: ServiceVendorsPage,
});

const AD_TIER_META: Record<VendorAdTier, { label: string; className: string }> =
  {
    premium: {
      label: 'PREMIUM',
      className: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
    },
    basic: {
      label: '광고',
      className: 'bg-blue-500 text-white',
    },
    none: { label: '', className: '' },
  };

function ServiceVendorsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPlatformAdmin = !!user?.isPlatformAdmin;
  const myOfficeId = user?.office?.id;

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [districtQuery, setDistrictQuery] = useState('');
  const [districtCode, setDistrictCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scope, setScope] = useState<'all' | 'public' | 'private'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [editingVendor, setEditingVendor] = useState<ServiceVendor | null>(
    null,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createAsPublic, setCreateAsPublic] = useState(false);
  const [detailVendor, setDetailVendor] = useState<ServiceVendor | null>(null);

  const filter: ServiceVendorFilter = useMemo(
    () => ({
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      district: districtCode ?? undefined,
      search: searchQuery.trim() || undefined,
      favoritesOnly: favoritesOnly || undefined,
      scope,
    }),
    [categoryFilter, districtCode, searchQuery, favoritesOnly, scope],
  );

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['service-vendors', filter],
    queryFn: () => api.serviceVendors.findAll(filter),
  });

  const { data: districtOptions = [] } = useQuery({
    queryKey: ['regions-search', districtQuery],
    queryFn: () => api.regions.search(districtQuery.trim(), 15),
    enabled: districtQuery.trim().length >= 1,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (vendorId: string) =>
      api.serviceVendors.toggleFavorite(vendorId),
    onMutate: async (vendorId) => {
      await queryClient.cancelQueries({ queryKey: ['service-vendors'] });
      const snapshots = queryClient.getQueriesData<ServiceVendor[]>({
        queryKey: ['service-vendors'],
      });
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData(
          key,
          prev.map((v) =>
            v.id === vendorId ? { ...v, isFavorite: !v.isFavorite } : v,
          ),
        );
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      for (const [key, prev] of ctx.snapshots)
        queryClient.setQueryData(key, prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vendorId: string) => api.serviceVendors.remove(vendorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
    },
  });

  const activeFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (districtCode ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (scope !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setCategoryFilter('all');
    setDistrictCode(null);
    setDistrictQuery('');
    setSearchQuery('');
    setFavoritesOnly(false);
    setScope('all');
  };

  const columns = useMemo<ColumnDef<ServiceVendor, unknown>[]>(
    () => buildColumns({
      myOfficeId,
      isPlatformAdmin,
      onToggleFavorite: (id) => toggleFavoriteMutation.mutate(id),
      onEdit: (v) => setEditingVendor(v),
      onDelete: (id) => {
        if (window.confirm('이 업체를 삭제하시겠습니까?')) {
          deleteMutation.mutate(id);
        }
      },
    }),
    [myOfficeId, isPlatformAdmin, toggleFavoriteMutation, deleteMutation],
  );

  return (
    <div className="-m-4 flex flex-1 flex-col gap-4 p-4 min-h-0 min-w-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">협력업체</h1>
        {!isLoading && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {vendors.length}곳
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCreateAsPublic(false);
              setIsCreateOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" />내 업체 등록
          </Button>
          {isPlatformAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setCreateAsPublic(true);
                setIsCreateOpen(true);
              }}
            >
              <Plus className="mr-1 size-4" />공용 업체 등록
            </Button>
          )}
        </div>
      </div>

      {/* 필터 카드 */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="업체명·메모·설명 검색"
              className="h-9 bg-background pl-9"
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v)}
          >
            <SelectTrigger className="h-9 min-w-[150px] bg-background">
              <SelectValue placeholder="카테고리" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {SERVICE_CATEGORY_ORDER.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {SERVICE_CATEGORY_LABEL[slug]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={isFilterOpen ? 'default' : 'outline'}
            size="sm"
            className={cn(!isFilterOpen && 'bg-background')}
            onClick={() => setIsFilterOpen((v) => !v)}
          >
            <Filter className="mr-1 size-4" />
            상세 필터
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 px-1.5 text-[10px]"
              >
                {activeFilterCount}
              </Badge>
            )}
            {isFilterOpen ? (
              <ChevronUp className="ml-1 size-4" />
            ) : (
              <ChevronDown className="ml-1 size-4" />
            )}
          </Button>

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={favoritesOnly}
              onCheckedChange={(v) => setFavoritesOnly(v === true)}
            />
            <span className="flex items-center gap-1">
              <Star
                className={cn(
                  'size-3.5',
                  favoritesOnly
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground',
                )}
              />
              즐겨찾기만
            </span>
          </label>
        </div>

        {isFilterOpen && (
          <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border/60 bg-background px-3 py-3">
            {/* 지역 선택 */}
            <div className="flex flex-wrap items-start gap-3">
              <Label className="w-20 shrink-0 pt-1.5 text-xs text-muted-foreground">
                지역
              </Label>
              <div className="flex flex-1 flex-col gap-1 min-w-[240px]">
                {districtCode ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="px-2 py-1 text-xs">
                      선택됨: {districtQuery}
                    </Badge>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setDistrictCode(null);
                        setDistrictQuery('');
                      }}
                    >
                      해제
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={districtQuery}
                      onChange={(e) => setDistrictQuery(e.target.value)}
                      placeholder="시/구/동 검색 (예: 강동구)"
                      className="h-8"
                    />
                    {districtQuery.trim() && districtOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {districtOptions
                          .filter((o) => o.level !== 'province')
                          .map((o) => (
                            <Button
                              key={`${o.level}-${o.code}`}
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setDistrictCode(o.code);
                                setDistrictQuery(o.fullName);
                              }}
                            >
                              {o.fullName}
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                [{o.level === 'district' ? '시군구' : '읍면동'}]
                              </span>
                            </Button>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 스코프 */}
            <div className="flex flex-wrap items-center gap-3">
              <Label className="w-20 shrink-0 text-xs text-muted-foreground">
                범위
              </Label>
              <div className="flex items-center gap-1">
                {(
                  [
                    { value: 'all', label: '전체' },
                    { value: 'public', label: '공용 풀만' },
                    { value: 'private', label: '내 업체만' },
                  ] as const
                ).map((s) => (
                  <Button
                    key={s.value}
                    size="xs"
                    variant={scope === s.value ? 'default' : 'outline'}
                    className={cn(scope !== s.value && 'bg-background')}
                    onClick={() => setScope(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                <RotateCcw className="mr-1 size-3.5" />
                초기화
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 테이블 */}
      <section className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background">
        {!isLoading && vendors.length === 0 ? (
          <EmptyState hasFilter={activeFilterCount > 0} />
        ) : (
          <DataTable
            columns={columns}
            data={vendors}
            layout="full-height"
            rowHeight={56}
            isLoading={isLoading}
            onRowClick={(v) => setDetailVendor(v)}
            emptyMessage={
              activeFilterCount > 0
                ? '조건에 맞는 업체가 없습니다'
                : '등록된 업체가 없습니다'
            }
          />
        )}
      </section>

      {/* 등록 다이얼로그 */}
      {isCreateOpen && (
        <VendorFormDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          mode="create"
          isPublic={createAsPublic}
          isPlatformAdmin={isPlatformAdmin}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
            setIsCreateOpen(false);
          }}
        />
      )}

      {/* 수정 다이얼로그 */}
      {editingVendor && (
        <VendorFormDialog
          open={!!editingVendor}
          onOpenChange={(o) => !o && setEditingVendor(null)}
          mode="edit"
          vendor={editingVendor}
          isPublic={editingVendor.officeId === null}
          isPlatformAdmin={isPlatformAdmin}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
            setEditingVendor(null);
          }}
        />
      )}

      {/* 상세 다이얼로그 */}
      {detailVendor && (
        <VendorDetailDialog
          vendor={detailVendor}
          isPlatformAdmin={isPlatformAdmin}
          myOfficeId={myOfficeId}
          onOpenChange={(o) => !o && setDetailVendor(null)}
          onEdit={() => {
            setEditingVendor(detailVendor);
            setDetailVendor(null);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Building2 className="size-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        {hasFilter
          ? '조건에 맞는 협력업체가 없습니다.'
          : '등록된 협력업체가 없습니다.'}
      </p>
      <p className="text-xs text-muted-foreground">
        "내 업체 등록"으로 자주 쓰는 업체를 추가하세요.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Table columns
// ────────────────────────────────────────────────────────

interface ColumnCtx {
  myOfficeId: string | undefined;
  isPlatformAdmin: boolean;
  onToggleFavorite: (id: string) => void;
  onEdit: (v: ServiceVendor) => void;
  onDelete: (id: string) => void;
}

function buildColumns(ctx: ColumnCtx): ColumnDef<ServiceVendor, unknown>[] {
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
            <Badge className={cn('w-fit text-[10px]', AD_TIER_META[v.adTier].className)}>
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

  // 3. 업체명
  columns.push({
    id: 'name',
    header: '업체명',
    size: 200,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">
          {row.original.name}
        </span>
        {row.original.description && (
          <span className="truncate text-[11px] text-muted-foreground">
            {row.original.description}
          </span>
        )}
      </div>
    ),
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

  // 5. 담당자/전화
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
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
            <Phone className="size-3" />
            {main.phone}
            {contacts.length > 1 && (
              <span className="ml-1 text-muted-foreground/70">
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
            onClick={() => ctx.onDelete(v.id)}
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

// ────────────────────────────────────────────────────────
// 등록/수정 다이얼로그
// ────────────────────────────────────────────────────────

interface VendorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  vendor?: ServiceVendor;
  isPublic: boolean;
  isPlatformAdmin: boolean;
  onSuccess: () => void;
}

function VendorFormDialog({
  open,
  onOpenChange,
  mode,
  vendor,
  isPublic,
  isPlatformAdmin,
  onSuccess,
}: VendorFormProps) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [businessType, setBusinessType] = useState<string>(
    vendor?.businessType ?? 'sole_proprietor',
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    vendor?.serviceCategories ?? [],
  );
  const [coverageDistricts, setCoverageDistricts] = useState<
    Array<{ code: string; label: string }>
  >(
    vendor
      ? vendor.coverageDistricts.map((c) => ({ code: c, label: c }))
      : [],
  );
  const [districtQuery, setDistrictQuery] = useState('');
  const [priceNote, setPriceNote] = useState(vendor?.priceNote ?? '');
  const [description, setDescription] = useState(vendor?.description ?? '');
  const [memo, setMemo] = useState(vendor?.memo ?? '');

  const [adTier, setAdTier] = useState<VendorAdTier>(vendor?.adTier ?? 'none');
  const [adPriority, setAdPriority] = useState<string>(
    String(vendor?.adPriority ?? 0),
  );
  const [isVerified, setIsVerified] = useState(!!vendor?.isVerified);

  // 첫 담당자 (등록 시). 수정 시에는 VendorDetailDialog에서 별도 처리.
  const [firstContactName, setFirstContactName] = useState('');
  const [firstContactPhone, setFirstContactPhone] = useState('');
  const [firstContactRole, setFirstContactRole] = useState('');

  const [error, setError] = useState<string | null>(null);

  const { data: districtOptions = [] } = useQuery({
    queryKey: ['regions-search', districtQuery],
    queryFn: () => api.regions.search(districtQuery.trim(), 15),
    enabled: districtQuery.trim().length >= 1,
  });

  const canUseAdFields = isPublic && isPlatformAdmin;

  const createMutation = useMutation({
    mutationFn: async () => {
      const dto: CreateServiceVendorDto = {
        name: name.trim(),
        businessType: (businessType as CreateServiceVendorDto['businessType']) || undefined,
        serviceCategories: selectedCategories,
        coverageDistricts: coverageDistricts.map((d) => d.code),
        priceNote: priceNote.trim() || undefined,
        description: description.trim() || undefined,
        memo: memo.trim() || undefined,
        isPublic,
      };
      if (canUseAdFields) {
        dto.adTier = adTier;
        dto.adPriority = Number.parseInt(adPriority, 10) || 0;
        dto.isVerified = isVerified;
      }
      const created = await api.serviceVendors.create(dto);

      // 첫 담당자가 있으면 생성
      if (firstContactName.trim() && firstContactPhone.trim()) {
        await api.serviceVendors.addContact(created.id, {
          name: firstContactName.trim(),
          phone: firstContactPhone.trim(),
          role: firstContactRole.trim() || undefined,
        });
      }
      return created;
    },
    onSuccess,
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!vendor) throw new Error('no vendor');
      const dto: UpdateServiceVendorDto = {
        name: name.trim(),
        businessType:
          (businessType as UpdateServiceVendorDto['businessType']) || null,
        serviceCategories: selectedCategories,
        coverageDistricts: coverageDistricts.map((d) => d.code),
        priceNote: priceNote.trim() || null,
        description: description.trim() || null,
        memo: memo.trim() || null,
      };
      if (canUseAdFields) {
        dto.adTier = adTier;
        dto.adPriority = Number.parseInt(adPriority, 10) || 0;
        dto.isVerified = isVerified;
      }
      return api.serviceVendors.update(vendor.id, dto);
    },
    onSuccess,
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : '수정에 실패했습니다.'),
  });

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const addDistrict = (code: string, label: string) => {
    if (coverageDistricts.some((d) => d.code === code)) return;
    setCoverageDistricts((prev) => [...prev, { code, label }]);
    setDistrictQuery('');
  };

  const removeDistrict = (code: string) => {
    setCoverageDistricts((prev) => prev.filter((d) => d.code !== code));
  };

  const isValid =
    name.trim().length > 0 &&
    selectedCategories.length > 0 &&
    coverageDistricts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '업체 등록' : '업체 수정'}
            {isPublic && (
              <Badge className="ml-2 bg-purple-500 text-white">공용 풀</Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-sm">업체명 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="(주)한솔설비, 김철수 배관 등"
              />
            </div>

            <div>
              <Label className="text-sm">사업자 유형</Label>
              <Select
                value={businessType}
                onValueChange={(v) => setBusinessType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">개인 (무등록)</SelectItem>
                  <SelectItem value="sole_proprietor">개인사업자</SelectItem>
                  <SelectItem value="corporate">법인</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">단가 메모</Label>
              <Input
                value={priceNote}
                onChange={(e) => setPriceNote(e.target.value)}
                placeholder="누수 15~25만, 출장비 별도"
              />
            </div>

            <div className="col-span-2">
              <Label className="text-sm">서비스 카테고리 * (복수 선택)</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {SERVICE_CATEGORY_ORDER.map((slug) => (
                  <Button
                    key={slug}
                    type="button"
                    size="xs"
                    variant={
                      selectedCategories.includes(slug) ? 'default' : 'outline'
                    }
                    onClick={() => toggleCategory(slug)}
                  >
                    {SERVICE_CATEGORY_LABEL[slug]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <Label className="text-sm">서비스 가능 지역 *</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {coverageDistricts.map((d) => (
                  <Badge
                    key={d.code}
                    variant="secondary"
                    className="cursor-pointer gap-1"
                    onClick={() => removeDistrict(d.code)}
                  >
                    {d.label}
                    <span className="text-muted-foreground">×</span>
                  </Badge>
                ))}
              </div>
              <Input
                className="mt-2 h-8"
                value={districtQuery}
                onChange={(e) => setDistrictQuery(e.target.value)}
                placeholder="지역 검색 (예: 강동구, 고덕동)"
              />
              {districtQuery.trim() && districtOptions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {districtOptions
                    .filter((o) => o.level !== 'province')
                    .map((o) => (
                      <Button
                        key={`${o.level}-${o.code}`}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => addDistrict(o.code, o.fullName)}
                      >
                        + {o.fullName}
                      </Button>
                    ))}
                </div>
              )}
            </div>

            <div className="col-span-2">
              <Label className="text-sm">
                설명{isPublic ? ' (중개사에게 노출)' : ''}
              </Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isPublic
                    ? '24시간 긴급 출동, 경력 15년 등'
                    : '(공용 업체면 노출되는 소개글)'
                }
              />
            </div>

            <div className="col-span-2">
              <Label className="text-sm">내부 메모</Label>
              <Textarea
                rows={2}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="야간도 받아줌, 기사 친절함 등"
              />
            </div>

            {mode === 'create' && (
              <div className="col-span-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  첫 담당자 (선택)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="이름"
                    value={firstContactName}
                    onChange={(e) => setFirstContactName(e.target.value)}
                  />
                  <Input
                    placeholder="010-1234-5678"
                    value={firstContactPhone}
                    onChange={(e) => setFirstContactPhone(e.target.value)}
                  />
                  <Input
                    placeholder="대표, 배관기사 등"
                    value={firstContactRole}
                    onChange={(e) => setFirstContactRole(e.target.value)}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  저장 후 상세 화면에서 담당자 추가/수정 가능
                </p>
              </div>
            )}

            {/* 광고 필드 (플랫폼 운영자 + 공용 업체만) */}
            {canUseAdFields && (
              <div className="col-span-2 rounded-md border border-purple-200 bg-purple-50/40 p-3">
                <div className="mb-2 text-xs font-medium text-purple-900">
                  광고 설정 (플랫폼 운영자 전용)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">광고 티어</Label>
                    <Select
                      value={adTier}
                      onValueChange={(v) => setAdTier(v as VendorAdTier)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">none (무료)</SelectItem>
                        <SelectItem value="basic">basic</SelectItem>
                        <SelectItem value="premium">premium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">우선순위 (0~)</Label>
                    <Input
                      type="number"
                      value={adPriority}
                      onChange={(e) => setAdPriority(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={isVerified}
                        onCheckedChange={(v) => setIsVerified(v === true)}
                      />
                      <span>검증 완료</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          {error && (
            <p className="mt-3 text-xs text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={
              !isValid ||
              createMutation.isPending ||
              updateMutation.isPending
            }
            onClick={() => {
              setError(null);
              if (mode === 'create') createMutation.mutate();
              else updateMutation.mutate();
            }}
          >
            {createMutation.isPending || updateMutation.isPending
              ? '저장 중...'
              : mode === 'create'
                ? '등록'
                : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────
// 상세 다이얼로그 (담당자 목록·추가·즐겨찾기 메모)
// ────────────────────────────────────────────────────────

interface DetailProps {
  vendor: ServiceVendor;
  isPlatformAdmin: boolean;
  myOfficeId: string | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

function VendorDetailDialog({
  vendor,
  isPlatformAdmin,
  myOfficeId,
  onOpenChange,
  onEdit,
}: DetailProps) {
  const queryClient = useQueryClient();
  const canEdit =
    vendor.officeId === myOfficeId ||
    (vendor.officeId === null && isPlatformAdmin);

  const { data: fresh } = useQuery({
    queryKey: ['service-vendor', vendor.id],
    queryFn: () => api.serviceVendors.findOne(vendor.id),
    initialData: vendor,
  });
  const v = fresh ?? vendor;

  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('');

  const [favoriteMemo, setFavoriteMemo] = useState(v.favoriteMemo ?? '');

  const addContactMutation = useMutation({
    mutationFn: () =>
      api.serviceVendors.addContact(v.id, {
        name: newName.trim(),
        phone: newPhone.trim(),
        role: newRole.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendor', v.id] });
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
      setNewContactOpen(false);
      setNewName('');
      setNewPhone('');
      setNewRole('');
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.serviceVendors.removeContact(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendor', v.id] });
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
    },
  });

  const updateFavoriteMemoMutation = useMutation({
    mutationFn: (memo: string | null) =>
      api.serviceVendors.updateFavoriteMemo(v.id, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendor', v.id] });
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {v.name}
            {v.adTier !== 'none' && (
              <Badge className={cn('text-[10px]', AD_TIER_META[v.adTier].className)}>
                {AD_TIER_META[v.adTier].label}
              </Badge>
            )}
            {v.isVerified && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] text-blue-600"
              >
                <BadgeCheck className="size-3" /> 검증
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto">
          {v.description && (
            <p className="text-sm">{v.description}</p>
          )}

          <div className="flex flex-wrap gap-1">
            {v.serviceCategories.map((c) => (
              <Badge key={c} variant="secondary" className="text-[11px]">
                {SERVICE_CATEGORY_LABEL[c as ServiceCategory] ?? c}
              </Badge>
            ))}
          </div>

          {v.priceNote && (
            <div className="text-sm">
              <span className="text-muted-foreground">단가: </span>
              {v.priceNote}
            </div>
          )}

          {v.coverageDistricts.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">서비스 지역: </span>
              {v.coverageDistricts.join(', ')}
            </div>
          )}

          {v.memo && (
            <div className="rounded-md bg-muted/50 p-2 text-[12px]">
              <span className="text-muted-foreground">메모: </span>
              {v.memo}
            </div>
          )}

          {/* 즐겨찾기 메모 */}
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
            <Label className="flex items-center gap-1 text-xs">
              <Star
                className={cn(
                  'size-3.5',
                  v.isFavorite
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground',
                )}
              />
              내 즐겨찾기 메모
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={favoriteMemo}
                onChange={(e) => setFavoriteMemo(e.target.value)}
                placeholder="김기사 친절함, 새벽 가능 등"
                className="h-8"
              />
              <Button
                size="sm"
                onClick={() =>
                  updateFavoriteMemoMutation.mutate(favoriteMemo.trim() || null)
                }
                disabled={updateFavoriteMemoMutation.isPending}
              >
                저장
              </Button>
            </div>
          </div>

          {/* 담당자 목록 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-medium">담당자 연락처</Label>
              {canEdit && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setNewContactOpen(true)}
                >
                  <Plus className="mr-1 size-3" />
                  추가
                </Button>
              )}
            </div>
            {v.vendorContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                등록된 담당자가 없습니다.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {v.vendorContacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    canEdit={canEdit}
                    onRemove={() => removeContactMutation.mutate(c.id)}
                  />
                ))}
              </div>
            )}
            {newContactOpen && (
              <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="이름"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8"
                  />
                  <Input
                    placeholder="전화번호"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="h-8"
                  />
                  <Input
                    placeholder="역할 (대표/기사 등)"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="mt-1 flex gap-1">
                  <Button
                    size="xs"
                    onClick={() => addContactMutation.mutate()}
                    disabled={
                      !newName.trim() ||
                      !newPhone.trim() ||
                      addContactMutation.isPending
                    }
                  >
                    저장
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setNewContactOpen(false)}
                  >
                    취소
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {canEdit && (
            <Button size="sm" onClick={onEdit}>
              <Pencil className="mr-1 size-3.5" />
              수정
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactRow({
  contact,
  canEdit,
  onRemove,
}: {
  contact: VendorContact;
  canEdit: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{contact.name}</span>
        {contact.role && (
          <span className="text-xs text-muted-foreground">· {contact.role}</span>
        )}
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          · {contact.phone}
        </span>
      </div>
      {canEdit && (
        <Button
          size="xs"
          variant="ghost"
          className="text-red-600"
          onClick={onRemove}
          title="삭제"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
