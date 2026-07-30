/**
 * 호실 수정 다이얼로그 + 호실 컨텍스트 상담 추가 다이얼로그.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { FileText, Home } from 'lucide-react';
import { api } from '@/lib/api';
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
    name: unit.name,
    floor: unit.floor != null ? String(unit.floor) : '',
    lineNo: unit.lineNo != null ? String(unit.lineNo) : '',
    siteUnitTypeId: unit.siteUnitTypeId ?? NONE,
    exclusiveArea: unit.exclusiveAreaM2 != null ? String(unit.exclusiveAreaM2) : '',
    supplyArea: unit.supplyAreaM2 != null ? String(unit.supplyAreaM2) : '',
  });

  // 다이얼로그가 열릴 때마다 현재 호실 값으로 초기화
  useEffect(() => {
    if (!open) return;
    setForm({
      dongId: unit.dongId,
      name: unit.name,
      floor: unit.floor != null ? String(unit.floor) : '',
      lineNo: unit.lineNo != null ? String(unit.lineNo) : '',
      siteUnitTypeId: unit.siteUnitTypeId ?? NONE,
      exclusiveArea: unit.exclusiveAreaM2 != null ? String(unit.exclusiveAreaM2) : '',
      supplyArea: unit.supplyAreaM2 != null ? String(unit.supplyAreaM2) : '',
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
      toast.error(error instanceof Error ? error.message : '호실 수정에 실패했습니다');
    },
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const parseNum = (value: string) => {
      if (!value.trim()) return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };
    updateMutation.mutate({
      name: form.name.trim(),
      dongId: form.dongId,
      siteUnitTypeId: form.siteUnitTypeId === NONE ? null : form.siteUnitTypeId,
      floor: parseNum(form.floor),
      lineNo: parseNum(form.lineNo),
      exclusiveAreaM2: parseNum(form.exclusiveArea) ?? undefined,
      supplyAreaM2: parseNum(form.supplyArea) ?? undefined,
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
            {site.name} · {unit.name}
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
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!form.name.trim() || updateMutation.isPending}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 상담 추가 (호실 컨텍스트) ────────────────────────────────────

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
  dongName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  site: SiteDetail;
  dongName: string;
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
      toast.success('상담을 기록했습니다');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '상담 기록에 실패했습니다');
    },
  });

  const registerManagedUnitMutation = useMutation({
    mutationFn: () => api.properties.create({ siteId: site.id, unitId: unit.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success('관리호수로 등록했습니다');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '관리호수 등록에 실패했습니다');
    },
  });

  const unitLabel = `${dongName ? `${dongName} ` : ''}${unit.name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>상담 추가</DialogTitle>
          <DialogDescription>
            {site.name} {unitLabel} 호실 맥락으로 상담을 기록합니다
          </DialogDescription>
        </DialogHeader>

        {!primaryProperty ? (
          <div className="space-y-3 rounded-lg border border-dashed p-5 text-center">
            <Home className="mx-auto size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              이 호실은 아직 우리 사무소의 관리호수로 등록되지 않았습니다.
              <br />
              관리호수로 연결한 뒤 소유자·세입자와 상담을 기록할 수 있습니다.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
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
                  매물 의뢰 등록
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
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    이 호실에 연결된 연락처(소유자/세입자)가 없습니다. 먼저 소유자나 세입자를
                    연결해주세요.
                  </p>
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
                기록
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
