import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  ServiceVendor,
  UpdateVendorContactDto,
  VendorContact,
} from '@estate-erp/api-client';
import {
  SERVICE_CATEGORY_LABEL,
  type ServiceCategory,
} from '@estate-erp/shared';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone } from '@/lib/format';
import { ConfirmDialog, DetailField } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRegionLabelResolver } from './-region-labels';
import {
  AD_TIER_META,
  BUSINESS_TYPE_LABEL,
  getErrorMessage,
} from './-vendor-utils';

interface DetailProps {
  vendor: ServiceVendor;
  isPlatformAdmin: boolean;
  myOfficeId: string | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

export function VendorDetailDialog({
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

  const resolveRegion = useRegionLabelResolver(v.coverageDistricts);

  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [contactDeleteTarget, setContactDeleteTarget] =
    useState<VendorContact | null>(null);

  const [favoriteMemo, setFavoriteMemo] = useState(v.favoriteMemo ?? '');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['service-vendor', v.id] });
    queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
  };

  const addContactMutation = useMutation({
    mutationFn: () =>
      api.serviceVendors.addContact(v.id, {
        name: newName.trim(),
        phone: newPhone.trim(),
        role: newRole.trim() || undefined,
        memo: newMemo.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('담당자가 추가되었습니다');
      invalidate();
      setNewContactOpen(false);
      setNewName('');
      setNewPhone('');
      setNewRole('');
      setNewMemo('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateContactMutation = useMutation({
    mutationFn: ({
      contactId,
      dto,
    }: {
      contactId: string;
      dto: UpdateVendorContactDto;
    }) => api.serviceVendors.updateContact(contactId, dto),
    onSuccess: () => {
      toast.success('담당자 정보가 수정되었습니다');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const removeContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.serviceVendors.removeContact(contactId),
    onSuccess: () => {
      toast.success('담당자가 삭제되었습니다');
      invalidate();
      setContactDeleteTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reorderContactMutation = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const list = [...v.vendorContacts];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      await Promise.all(
        list.map((c, idx) =>
          c.sortOrder === idx
            ? Promise.resolve()
            : api.serviceVendors.updateContact(c.id, { sortOrder: idx }),
        ),
      );
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateFavoriteMemoMutation = useMutation({
    mutationFn: (memo: string | null) =>
      api.serviceVendors.updateFavoriteMemo(v.id, memo),
    onSuccess: () => {
      toast.success('즐겨찾기 메모가 저장되었습니다');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const isMine = v.officeId !== null && v.officeId === myOfficeId;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {v.name}
            {isMine ? (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 text-[10px]"
              >
                내 업체
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground"
              >
                공용
              </Badge>
            )}
            {v.adTier !== 'none' && (
              <Badge
                className={cn('text-[10px]', AD_TIER_META[v.adTier].className)}
              >
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
          {v.description && <p className="text-sm">{v.description}</p>}

          <div className="flex flex-wrap gap-1">
            {v.serviceCategories.map((c) => (
              <Badge key={c} variant="secondary" className="text-[11px]">
                {SERVICE_CATEGORY_LABEL[c as ServiceCategory] ?? c}
              </Badge>
            ))}
          </div>

          <div className="space-y-1.5">
            {v.businessType && (
              <DetailField label="사업자 유형">
                {BUSINESS_TYPE_LABEL[v.businessType]}
              </DetailField>
            )}
            {v.priceNote && (
              <DetailField label="단가">{v.priceNote}</DetailField>
            )}
            {v.coverageDistricts.length > 0 && (
              <DetailField label="서비스 지역">
                {v.coverageDistricts.map(resolveRegion).join(', ')}
              </DetailField>
            )}
            {v.tags.length > 0 && (
              <DetailField label="태그">
                <span className="flex flex-wrap gap-1">
                  {v.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-[10px] text-muted-foreground"
                    >
                      {t}
                    </Badge>
                  ))}
                </span>
              </DetailField>
            )}
            {isPlatformAdmin &&
              v.officeId === null &&
              (v.adStartDate || v.adEndDate) && (
                <DetailField label="광고 기간">
                  {formatDate(v.adStartDate)} ~ {formatDate(v.adEndDate)}
                </DetailField>
              )}
          </div>

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
                {v.vendorContacts.map((c, idx) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    canEdit={canEdit}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < v.vendorContacts.length - 1}
                    isReordering={reorderContactMutation.isPending}
                    isSaving={updateContactMutation.isPending}
                    onMoveUp={() =>
                      reorderContactMutation.mutate({ from: idx, to: idx - 1 })
                    }
                    onMoveDown={() =>
                      reorderContactMutation.mutate({ from: idx, to: idx + 1 })
                    }
                    onUpdate={(dto) =>
                      updateContactMutation.mutateAsync({
                        contactId: c.id,
                        dto,
                      })
                    }
                    onRemove={() => setContactDeleteTarget(c)}
                  />
                ))}
              </div>
            )}
            {newContactOpen && (
              <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="이름 *"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8"
                  />
                  <Input
                    placeholder="전화번호 *"
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
                  <Input
                    placeholder="메모"
                    value={newMemo}
                    onChange={(e) => setNewMemo(e.target.value)}
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
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

      <ConfirmDialog
        open={!!contactDeleteTarget}
        onOpenChange={(o) => !o && setContactDeleteTarget(null)}
        title="담당자 삭제"
        description={
          contactDeleteTarget
            ? `'${contactDeleteTarget.name} (${formatPhone(contactDeleteTarget.phone)})' 연락처를 삭제하시겠습니까?`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={removeContactMutation.isPending}
        onConfirm={() => {
          if (contactDeleteTarget)
            removeContactMutation.mutate(contactDeleteTarget.id);
        }}
      />
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────
// 담당자 행 (보기/인라인 수정 + 전화/복사/순서)
// ────────────────────────────────────────────────────────

function ContactRow({
  contact,
  canEdit,
  canMoveUp,
  canMoveDown,
  isReordering,
  isSaving,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  contact: VendorContact;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isReordering: boolean;
  isSaving: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (dto: UpdateVendorContactDto) => Promise<unknown>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [role, setRole] = useState(contact.role ?? '');
  const [memo, setMemo] = useState(contact.memo ?? '');

  const startEdit = () => {
    setName(contact.name);
    setPhone(contact.phone);
    setRole(contact.role ?? '');
    setMemo(contact.memo ?? '');
    setEditing(true);
  };

  const save = async () => {
    try {
      await onUpdate({
        name: name.trim(),
        phone: phone.trim(),
        role: role.trim() || null,
        memo: memo.trim() || null,
      });
      setEditing(false);
    } catch {
      // 에러 토스트는 mutation onError에서 처리
    }
  };

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(contact.phone);
      toast.success('전화번호를 복사했습니다');
    } catch {
      toast.error('전화번호 복사에 실패했습니다');
    }
  };

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="이름 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
          <Input
            placeholder="전화번호 *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-8"
          />
          <Input
            placeholder="역할 (대표/기사 등)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-8"
          />
          <Input
            placeholder="메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="mt-1 flex gap-1">
          <Button
            size="xs"
            onClick={() => void save()}
            disabled={!name.trim() || !phone.trim() || isSaving}
          >
            저장
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{contact.name}</span>
          {contact.role && (
            <span className="shrink-0 text-xs text-muted-foreground">
              · {contact.role}
            </span>
          )}
          <a
            href={`tel:${contact.phone}`}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
            title="전화 걸기"
          >
            <Phone className="size-3" />
            {formatPhone(contact.phone)}
          </a>
        </div>
        {contact.memo && (
          <span className="truncate text-[11px] text-muted-foreground">
            {contact.memo}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void copyPhone()}
          title="전화번호 복사"
        >
          <Copy className="size-3.5" />
        </Button>
        {canEdit && (
          <>
            <Button
              size="xs"
              variant="ghost"
              onClick={onMoveUp}
              disabled={!canMoveUp || isReordering}
              title="위로"
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onMoveDown}
              disabled={!canMoveDown || isReordering}
              title="아래로"
            >
              <ChevronDown className="size-3.5" />
            </Button>
            <Button size="xs" variant="ghost" onClick={startEdit} title="수정">
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-red-600"
              onClick={onRemove}
              title="삭제"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
