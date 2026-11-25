/**
 * 호실 수정 다이얼로그 + 이 호실의 상담 적기 다이얼로그.
 */
import { formatPlaceLabel } from '@estate-erp/shared';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { FileText, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import type { Dong, SiteDetail, Unit, UpdateUnitDto } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatPhone } from '@/lib/format';
import { consultationTypeLabels } from './-site-helpers';

const NONE = '__none__';

// ── 호실 수정 ────────────────────────────────────────────────────

export function UnitEditDialog({
  open,
  onOpenChange,
  unit,
  site,
  dongs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  site: SiteDetail;
  dongs: Dong[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    dongId: unit.dongId,
    name: unit.name ?? '',
    floor: unit.floor != null ? String(unit.floor) : '',
    lineNo: unit.lineNo != null ? String(unit.lineNo) : '',
    siteUnitTypeId: unit.siteUnitTypeId ?? NONE,
    exclusiveArea: unit.exclusiveAreaM2 != null ? String(unit.exclusiveAreaM2) : '',
    supplyArea: unit.supplyAreaM2 != null ? String(unit.supplyAreaM2) : '',
    roomCount: unit.roomCount != null ? String(unit.roomCount) : '',
    bathRoomCount: unit.bathRoomCount != null ? String(unit.bathRoomCount) : '',
  });

  // 다이얼로그가 열릴 때마다 현재 호실 값으로 초기화
  useEffect(() => {
    if (!open) return;
    setForm({
      dongId: unit.dongId,
      name: unit.name ?? '',
      floor: unit.floor != null ? String(unit.floor) : '',
      lineNo: unit.lineNo != null ? String(unit.lineNo) : '',
      siteUnitTypeId: unit.siteUnitTypeId ?? NONE,
      exclusiveArea: unit.exclusiveAreaM2 != null ? String(unit.exclusiveAreaM2) : '',
      supplyArea: unit.supplyAreaM2 != null ? String(unit.supplyAreaM2) : '',
      roomCount: unit.roomCount != null ? String(unit.roomCount) : '',
      bathRoomCount: unit.bathRoomCount != null ? String(unit.bathRoomCount) : '',
    });
  }, [open, unit]);

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateUnitDto) => api.units.update(unit.id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      toast.success('호실 정보를 수정했습니다');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '호실 정보를 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const handleSubmit = () => {
    // 호 없이 층이 단위인 공간은 이름을 비워 둘 수 있다
    if (!form.name.trim() && !form.floor.trim()) return;
    const parseNum = (value: string) => {
      if (!value.trim()) return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };
    updateMutation.mutate({
      name: form.name.trim() || null,
      dongId: form.dongId,
      siteUnitTypeId: form.siteUnitTypeId === NONE ? null : form.siteUnitTypeId,
      floor: parseNum(form.floor),
      lineNo: parseNum(form.lineNo),
      exclusiveAreaM2: parseNum(form.exclusiveArea) ?? undefined,
      supplyAreaM2: parseNum(form.supplyArea) ?? undefined,
      roomCount: parseNum(form.roomCount),
      bathRoomCount: parseNum(form.bathRoomCount),
    });
  };

  const visibleDongs = dongs.filter((dong) => !dong.isPlaceholder);
  const unitTypes = site.siteUnitTypes ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>호실 수정</DialogTitle>
          <DialogDescription>
            {formatPlaceLabel({
              siteName: site.name,
              dongName: dongs.find((dong) => dong.id === unit.dongId)?.name,
              dongIsPlaceholder: dongs.find((dong) => dong.id === unit.dongId)?.isPlaceholder,
              unit,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {visibleDongs.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">동</Label>
              <Select
                value={form.dongId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, dongId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="동 선택" />
                </SelectTrigger>
                <SelectContent>
                  {dongs.map((dong) => (
                    <SelectItem key={dong.id} value={dong.id}>
                      {dong.isPlaceholder ? '본동(단일동)' : dong.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">
              호수 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="예: 1503호"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">층</Label>
              <Input
                type="number"
                value={form.floor}
                onChange={(e) => setForm((prev) => ({ ...prev, floor: e.target.value }))}
                placeholder="예: 15"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">라인</Label>
              <Input
                type="number"
                value={form.lineNo}
                onChange={(e) => setForm((prev) => ({ ...prev, lineNo: e.target.value }))}
                placeholder="예: 3"
              />
            </div>
          </div>
          {unitTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">평형 타입</Label>
              <Select
                value={form.siteUnitTypeId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, siteUnitTypeId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="타입 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>미지정</SelectItem>
                  {unitTypes.map((unitType) => (
                    <SelectItem key={unitType.id} value={unitType.id}>
                      {unitType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">전용면적 (m²)</Label>
              <Input
                type="number"
                value={form.exclusiveArea}
                onChange={(e) => setForm((prev) => ({ ...prev, exclusiveArea: e.target.value }))}
                placeholder="예: 84.97"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">공급면적 (m²)</Label>
              <Input
                type="number"
                value={form.supplyArea}
                onChange={(e) => setForm((prev) => ({ ...prev, supplyArea: e.target.value }))}
                placeholder="예: 112.45"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">방 수</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.roomCount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, roomCount: e.target.value }))
                  }
                  placeholder="예: 2"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">욕실 수</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.bathRoomCount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bathRoomCount: e.target.value }))
                  }
                  placeholder="예: 1"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              비워두면 선택한 평형 타입의 방/욕실 수를 사용합니다.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={(!form.name.trim() && !form.floor.trim()) || updateMutation.isPending}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 상담 적기 (이 호실) ─────────────────────────────────────────

interface ConsultCandidate {
  id: string;
  name: string;
  phone: string | null;
  roleLabel: string;
}

export function UnitConsultDialog({
  open,
  onOpenChange,
  unit,
  site,
  placeLabel,
  onAddOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  site: SiteDetail;
  /** "고덕그라시움 101동 3401호" — formatPlaceLabel로 만든 집 이름(단지 포함) */
  placeLabel: string;
  /** 상담할 상대가 없을 때 소유자를 연결하러 간다(관리호수가 아니면 관리호수로 만든 뒤) */
  onAddOwner?: () => void;
}) {
  const queryClient = useQueryClient();
  const properties = useMemo(() => unit.properties ?? [], [unit]);
  const primaryProperty = properties[0];

  const candidates = useMemo<ConsultCandidate[]>(() => {
    const map = new Map<string, ConsultCandidate>();
    for (const property of properties) {
      for (const pc of property.propertyContacts ?? []) {
        if (!map.has(pc.contact.id)) {
          map.set(pc.contact.id, {
            id: pc.contact.id,
            name: pc.contact.name,
            phone: pc.contact.phone,
            roleLabel: '소유자',
          });
        }
      }
      for (const tenant of property.tenants ?? []) {
        if (!map.has(tenant.contact.id)) {
          map.set(tenant.contact.id, {
            id: tenant.contact.id,
            name: tenant.contact.name,
            phone: tenant.contact.phone,
            roleLabel: '세입자',
          });
        }
      }
      for (const consultation of property.consultations ?? []) {
        if (!map.has(consultation.contact.id)) {
          map.set(consultation.contact.id, {
            id: consultation.contact.id,
            name: consultation.contact.name,
            phone: consultation.contact.phone,
            roleLabel: '상담이력',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [properties]);

  const [contactId, setContactId] = useState('');
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setContactId(candidates[0]?.id ?? '');
    setType('phone');
    setContent('');
  }, [open, candidates]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.consultations.create({
        contactId,
        type,
        content: content.trim(),
        propertyId: primaryProperty?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      toast.success('상담을 적었습니다');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '상담을 기록하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const registerManagedUnitMutation = useMutation({
    mutationFn: () => api.properties.create({ siteId: site.id, unitId: unit.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      // 관리단지 사이드바의 단지별 관리호수 수(office-sites 집계)도 함께 갱신
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      toast.success('관리호수로 등록했습니다');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '관리호수로 등록하지 못했습니다. 다시 시도해 주세요.'));
    },
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>상담 적기</DialogTitle>
          <DialogDescription>
            {placeLabel}의 소유자·세입자와 나눈 상담을 적습니다
          </DialogDescription>
        </DialogHeader>

        {!primaryProperty ? (
          <div className="space-y-3 rounded-lg border border-dashed p-5 text-center">
            <Home className="mx-auto size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              이 호실은 아직 우리 사무소의 관리호수로 등록되지 않았습니다.
              <br />
              소유자를 연결하면 관리호수로 등록되고, 그 소유자와의 상담을 기록할 수 있습니다.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {onAddOwner && (
                <Button size="sm" onClick={onAddOwner}>
                  소유자 연결
                </Button>
              )}
              <Button
                size="sm"
                variant={onAddOwner ? 'outline' : 'default'}
                onClick={() => registerManagedUnitMutation.mutate()}
                disabled={registerManagedUnitMutation.isPending}
              >
                {registerManagedUnitMutation.isPending ? '등록 중...' : '관리호수로 등록'}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link
                  to="/properties/new"
                  search={{ siteId: site.id, dongId: unit.dongId, unitId: unit.id }}
                >
                  <FileText className="size-3.5" />
                  매물 등록
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  상담 상대 <span className="text-destructive">*</span>
                </Label>
                {candidates.length > 0 ? (
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger>
                      <SelectValue placeholder="연락처 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name} · {candidate.roleLabel}
                          {candidate.phone ? ` (${formatPhone(candidate.phone)})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    <span className="min-w-0">
                      이 호실에 연결된 소유자·세입자가 없습니다. 상담할 사람을 먼저 연결하세요.
                    </span>
                    {onAddOwner && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={onAddOwner}
                      >
                        소유자 연결
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">상담 방식</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(consultationTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  내용 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="상담 내용을 입력하세요"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!contactId || !content.trim() || createMutation.isPending}
              >
                저장
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
