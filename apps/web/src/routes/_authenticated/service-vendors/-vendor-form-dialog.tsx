import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateServiceVendorDto,
  ServiceVendor,
  UpdateServiceVendorDto,
  VendorAdTier,
} from '@estate-erp/api-client';
import {
  SERVICE_CATEGORY_LABEL,
  SERVICE_CATEGORY_ORDER,
} from '@estate-erp/shared';

import { api } from '@/lib/api';
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
import { normalizeToDistrictCode, useDistrictMap } from './-region-labels';
import { getErrorMessage } from './-vendor-utils';

interface VendorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  vendor?: ServiceVendor;
  isPublic: boolean;
  isPlatformAdmin: boolean;
  onSuccess: () => void;
}

export function VendorFormDialog({
  open,
  onOpenChange,
  mode,
  vendor,
  isPublic,
  isPlatformAdmin,
  onSuccess,
}: VendorFormProps) {
  const districtMap = useDistrictMap();

  const [name, setName] = useState(vendor?.name ?? '');
  const [businessType, setBusinessType] = useState<string>(
    vendor?.businessType ?? 'sole_proprietor',
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    vendor?.serviceCategories ?? [],
  );
  // 기존 데이터의 읍면동(10자리) 코드는 편집 진입 시 시군구로 정규화 → 저장 시 자연 마이그레이션
  const [coverageCodes, setCoverageCodes] = useState<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of vendor?.coverageDistricts ?? []) {
      const code = normalizeToDistrictCode(raw);
      if (!seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
    }
    return out;
  });
  const [districtQuery, setDistrictQuery] = useState('');
  const [priceNote, setPriceNote] = useState(vendor?.priceNote ?? '');
  const [description, setDescription] = useState(vendor?.description ?? '');
  const [memo, setMemo] = useState(vendor?.memo ?? '');

  const [tags, setTags] = useState<string[]>(vendor?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const [adTier, setAdTier] = useState<VendorAdTier>(vendor?.adTier ?? 'none');
  const [adPriority, setAdPriority] = useState<string>(
    String(vendor?.adPriority ?? 0),
  );
  const [adStartDate, setAdStartDate] = useState(
    vendor?.adStartDate ? vendor.adStartDate.slice(0, 10) : '',
  );
  const [adEndDate, setAdEndDate] = useState(
    vendor?.adEndDate ? vendor.adEndDate.slice(0, 10) : '',
  );
  const [isVerified, setIsVerified] = useState(!!vendor?.isVerified);

  // 첫 담당자 (등록 시). 수정 시에는 상세 다이얼로그에서 별도 처리.
  const [firstContactName, setFirstContactName] = useState('');
  const [firstContactPhone, setFirstContactPhone] = useState('');
  const [firstContactRole, setFirstContactRole] = useState('');

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
        businessType:
          (businessType as CreateServiceVendorDto['businessType']) || undefined,
        serviceCategories: selectedCategories,
        coverageDistricts: coverageCodes,
        priceNote: priceNote.trim() || undefined,
        description: description.trim() || undefined,
        memo: memo.trim() || undefined,
        tags,
        isPublic,
      };
      if (canUseAdFields) {
        dto.adTier = adTier;
        dto.adPriority = Number.parseInt(adPriority, 10) || 0;
        dto.isVerified = isVerified;
        if (adStartDate) dto.adStartDate = adStartDate;
        if (adEndDate) dto.adEndDate = adEndDate;
      }
      const created = await api.serviceVendors.create(dto);

      // 첫 담당자가 있으면 생성 (실패해도 업체 등록 자체는 성공 처리)
      if (firstContactName.trim() && firstContactPhone.trim()) {
        try {
          await api.serviceVendors.addContact(created.id, {
            name: firstContactName.trim(),
            phone: firstContactPhone.trim(),
            role: firstContactRole.trim() || undefined,
          });
        } catch {
          toast.error(
            '업체는 등록됐지만 담당자 저장에 실패했습니다. 상세 화면에서 다시 추가해주세요.',
          );
        }
      }
      return created;
    },
    onSuccess: () => {
      toast.success('업체가 등록되었습니다');
      onSuccess();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!vendor) throw new Error('수정할 업체 정보가 없습니다');
      const dto: UpdateServiceVendorDto = {
        name: name.trim(),
        businessType:
          (businessType as UpdateServiceVendorDto['businessType']) || null,
        serviceCategories: selectedCategories,
        coverageDistricts: coverageCodes,
        priceNote: priceNote.trim() || null,
        description: description.trim() || null,
        memo: memo.trim() || null,
        tags,
      };
      if (canUseAdFields) {
        dto.adTier = adTier;
        dto.adPriority = Number.parseInt(adPriority, 10) || 0;
        dto.isVerified = isVerified;
        dto.adStartDate = adStartDate || null;
        dto.adEndDate = adEndDate || null;
      }
      return api.serviceVendors.update(vendor.id, dto);
    },
    onSuccess: () => {
      toast.success('업체 정보가 수정되었습니다');
      onSuccess();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const addDistrict = (rawCode: string) => {
    const code = normalizeToDistrictCode(rawCode);
    setCoverageCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setDistrictQuery('');
  };

  const removeDistrict = (code: string) => {
    setCoverageCodes((prev) => prev.filter((c) => c !== code));
  };

  const addTag = () => {
    const t = tagInput.trim();
    setTagInput('');
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  };

  const suggestions = useMemo(
    () => districtOptions.filter((o) => o.level !== 'province'),
    [districtOptions],
  );

  const isValid =
    name.trim().length > 0 &&
    selectedCategories.length > 0 &&
    coverageCodes.length > 0;

  const isPending = createMutation.isPending || updateMutation.isPending;

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
              <Label className="text-sm">서비스 가능 지역 * (시군구 단위)</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {coverageCodes.map((code) => (
                  <Badge
                    key={code}
                    variant="secondary"
                    className="cursor-pointer gap-1"
                    onClick={() => removeDistrict(code)}
                  >
                    {districtMap.get(code) ?? code}
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
              {districtQuery.trim() && suggestions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {suggestions.map((o) => (
                    <Button
                      key={`${o.level}-${o.code}`}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => addDistrict(o.code)}
                    >
                      + {o.fullName}
                      {o.level === 'ward' && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          → {districtMap.get(normalizeToDistrictCode(o.code)) ??
                            '시군구'}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                읍면동을 선택하면 상위 시군구 기준으로 등록됩니다.
              </p>
            </div>

            <div className="col-span-2">
              <Label className="text-sm">태그</Label>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="cursor-pointer gap-1"
                    onClick={() => removeTag(t)}
                  >
                    {t}
                    <span className="text-muted-foreground">×</span>
                  </Badge>
                ))}
                <Input
                  className="h-7 w-40"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="단골, 24시간 등 + Enter"
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                >
                  추가
                </Button>
              </div>
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
                  <div>
                    <Label className="text-[11px]">광고 시작일</Label>
                    <Input
                      type="date"
                      value={adStartDate}
                      onChange={(e) => setAdStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">광고 종료일</Label>
                    <Input
                      type="date"
                      value={adEndDate}
                      onChange={(e) => setAdEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={!isValid || isPending}
            onClick={() => {
              if (mode === 'create') createMutation.mutate();
              else updateMutation.mutate();
            }}
          >
            {isPending ? '저장 중...' : mode === 'create' ? '등록' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
