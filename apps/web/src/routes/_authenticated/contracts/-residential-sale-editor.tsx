import { CirclePlus, Trash2 } from 'lucide-react';
import type {
  ResidentialSaleAgreementDraft,
  ResidentialSaleAgreementValidation,
  SaleAgreementPartySnapshot,
} from '@estate-erp/shared';
import { formatPrice } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type AgreementUpdater = (
  updater: (agreement: ResidentialSaleAgreementDraft) => ResidentialSaleAgreementDraft,
) => void;

export function ResidentialSaleAgreementEditor({
  agreement,
  validation,
  onChange,
}: {
  agreement: ResidentialSaleAgreementDraft;
  validation: ResidentialSaleAgreementValidation;
  onChange: AgreementUpdater;
}) {
  function updateSection<
    K extends 'property' | 'payment' | 'transfer' | 'brokerage',
    F extends keyof ResidentialSaleAgreementDraft[K],
  >(section: K, field: F, value: ResidentialSaleAgreementDraft[K][F]) {
    onChange((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value },
    }));
  }

  function updateParty(
    side: 'sellers' | 'buyers',
    key: string,
    patch: Partial<SaleAgreementPartySnapshot>,
  ) {
    onChange((current) => ({
      ...current,
      [side]: current[side].map((party) => (party.key === key ? { ...party, ...patch } : party)),
    }));
  }

  function addParty(side: 'sellers' | 'buyers', role: 'co_owner' | 'representative') {
    const key = `${side}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onChange((current) => ({
      ...current,
      [side]: [
        ...current[side],
        {
          key,
          contactId: null,
          partyType: 'individual',
          role,
          name: '',
          identificationNoMasked: '',
          address: '',
          phone: '',
          shareRatio: null,
          representedPartyName: '',
        },
      ],
    }));
  }

  function removeParty(side: 'sellers' | 'buyers', key: string) {
    onChange((current) => ({
      ...current,
      [side]: current[side].filter((party) => party.key !== key),
    }));
  }

  return (
    <div className="grid gap-4">
      <AgreementSection title="계약일">
        <AgreementField label="실제 계약 체결일" required>
          <Input
            type="date"
            value={agreement.actualAgreementAt}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                actualAgreementAt: event.target.value,
              }))
            }
          />
        </AgreementField>
        <AgreementField label="계약서 작성일" required>
          <Input
            type="date"
            value={agreement.writtenAt}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                writtenAt: event.target.value,
              }))
            }
          />
        </AgreementField>
      </AgreementSection>

      <AgreementSection title="부동산의 표시" columns="xl:grid-cols-3">
        <AgreementField label="도로명 주소" className="xl:col-span-2">
          <Input
            value={agreement.property.roadAddress}
            onChange={(event) => updateSection('property', 'roadAddress', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="지번 주소">
          <Input
            value={agreement.property.jibunAddress}
            onChange={(event) => updateSection('property', 'jibunAddress', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="매매 대상" required className="xl:col-span-3">
          <Input
            value={agreement.property.targetDescription}
            onChange={(event) => updateSection('property', 'targetDescription', event.target.value)}
            placeholder="단지·동·층·호 등 법정 표시"
          />
        </AgreementField>
        <AgreementField label="토지 지목">
          <Input
            value={agreement.property.landCategory}
            onChange={(event) => updateSection('property', 'landCategory', event.target.value)}
            placeholder="대"
          />
        </AgreementField>
        <NumberAgreementField
          label="토지 면적"
          value={agreement.property.landAreaM2}
          suffix="m²"
          onChange={(value) => updateSection('property', 'landAreaM2', value)}
        />
        <AgreementField label="건물 구조">
          <Input
            value={agreement.property.buildingStructure}
            onChange={(event) => updateSection('property', 'buildingStructure', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="건물 용도">
          <Input
            value={agreement.property.buildingUse}
            onChange={(event) => updateSection('property', 'buildingUse', event.target.value)}
          />
        </AgreementField>
        <NumberAgreementField
          label="건물 면적"
          value={agreement.property.buildingAreaM2}
          suffix="m²"
          onChange={(value) => updateSection('property', 'buildingAreaM2', value)}
        />
      </AgreementSection>

      <AgreementSection title="매매대금과 지급 일정" columns="xl:grid-cols-3">
        <NumberAgreementField
          label="매매대금"
          value={agreement.payment.totalPriceManwon}
          suffix="만원"
          required
          onChange={(value) => updateSection('payment', 'totalPriceManwon', value)}
        />
        <NumberAgreementField
          label="계약금"
          value={agreement.payment.depositManwon}
          suffix="만원"
          onChange={(value) => updateSection('payment', 'depositManwon', value)}
        />
        <AgreementField label="계약금 지급일">
          <Input
            type="date"
            value={agreement.payment.depositDueAt}
            onChange={(event) => updateSection('payment', 'depositDueAt', event.target.value)}
          />
        </AgreementField>
        <NumberAgreementField
          label="중도금"
          value={agreement.payment.interimManwon}
          suffix="만원"
          onChange={(value) => updateSection('payment', 'interimManwon', value)}
        />
        <AgreementField label="중도금 지급일">
          <Input
            type="date"
            value={agreement.payment.interimDueAt}
            onChange={(event) => updateSection('payment', 'interimDueAt', event.target.value)}
          />
        </AgreementField>
        <NumberAgreementField
          label="잔금"
          value={agreement.payment.balanceManwon}
          suffix="만원"
          onChange={(value) => updateSection('payment', 'balanceManwon', value)}
        />
        <AgreementField label="잔금 지급일" required>
          <Input
            type="date"
            value={agreement.payment.balanceDueAt}
            onChange={(event) => updateSection('payment', 'balanceDueAt', event.target.value)}
          />
        </AgreementField>
      </AgreementSection>

      <AgreementSection title="인도·소유권 이전과 확인">
        <AgreementField label="부동산 인도일" required>
          <Input
            type="date"
            value={agreement.transfer.deliveryAt}
            onChange={(event) => updateSection('transfer', 'deliveryAt', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="소유권 이전일" required>
          <Input
            type="date"
            value={agreement.transfer.ownershipTransferAt}
            onChange={(event) =>
              updateSection('transfer', 'ownershipTransferAt', event.target.value)
            }
          />
        </AgreementField>
        <AgreementField label="확인·설명서 교부일" required>
          <Input
            type="date"
            value={agreement.transfer.explanationDeliveredAt}
            onChange={(event) =>
              updateSection('transfer', 'explanationDeliveredAt', event.target.value)
            }
          />
        </AgreementField>
        <AgreementField label="소유권 이전·권리관계 정리" required className="md:col-span-2">
          <Textarea
            rows={3}
            value={agreement.transfer.rightsTransferDetails}
            onChange={(event) =>
              updateSection('transfer', 'rightsTransferDetails', event.target.value)
            }
          />
        </AgreementField>
        <AgreementField label="기타 조건" className="md:col-span-2">
          <Textarea
            rows={3}
            value={agreement.transfer.conditions}
            onChange={(event) => updateSection('transfer', 'conditions', event.target.value)}
          />
        </AgreementField>
      </AgreementSection>

      <PartySection
        title="매도인"
        side="sellers"
        parties={agreement.sellers}
        onUpdate={updateParty}
        onAdd={addParty}
        onRemove={removeParty}
      />
      <PartySection
        title="매수인"
        side="buyers"
        parties={agreement.buyers}
        onUpdate={updateParty}
        onAdd={addParty}
        onRemove={removeParty}
      />

      <AgreementSection title="중개사무소" columns="xl:grid-cols-3">
        <AgreementField label="중개사무소명" required>
          <Input
            value={agreement.brokerage.officeName}
            onChange={(event) => updateSection('brokerage', 'officeName', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="중개사무소 등록번호" required>
          <Input
            value={agreement.brokerage.registrationNo}
            onChange={(event) => updateSection('brokerage', 'registrationNo', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="개업공인중개사" required>
          <Input
            value={agreement.brokerage.representativeName}
            onChange={(event) =>
              updateSection('brokerage', 'representativeName', event.target.value)
            }
          />
        </AgreementField>
        <AgreementField label="사무소 주소" className="xl:col-span-2">
          <Input
            value={agreement.brokerage.address}
            onChange={(event) => updateSection('brokerage', 'address', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="사무소 전화">
          <Input
            type="tel"
            value={agreement.brokerage.phone}
            onChange={(event) => updateSection('brokerage', 'phone', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="소속공인중개사">
          <Input
            value={agreement.brokerage.associateName}
            onChange={(event) => updateSection('brokerage', 'associateName', event.target.value)}
          />
        </AgreementField>
        <AgreementField label="소속공인중개사 자격번호">
          <Input
            value={agreement.brokerage.associateLicenseNo}
            onChange={(event) =>
              updateSection('brokerage', 'associateLicenseNo', event.target.value)
            }
          />
        </AgreementField>
      </AgreementSection>

      <AgreementSection title="특약사항" columns="grid-cols-1">
        <AgreementField label="특약사항">
          <Textarea
            rows={8}
            value={agreement.specialTerms}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                specialTerms: event.target.value,
              }))
            }
          />
        </AgreementField>
      </AgreementSection>

      <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {agreement.sourceNotice}
        <span className="ml-2 font-medium text-foreground">
          오류 {validation.errors.length}건 · 확인 {validation.warnings.length}건
        </span>
      </div>
    </div>
  );
}

function AgreementSection({
  title,
  columns = 'xl:grid-cols-2',
  children,
}: {
  title: string;
  columns?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className={cn('grid gap-4 px-5 py-5 md:grid-cols-2', columns)}>
        {children}
      </CardContent>
    </Card>
  );
}

function AgreementField({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function NumberAgreementField({
  label,
  value,
  suffix,
  required,
  onChange,
}: {
  label: string;
  value: number | null;
  suffix: string;
  required?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <AgreementField label={label} required={required}>
      <div className="relative">
        <Input
          type="number"
          min="0"
          value={value ?? ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
          className="pr-14"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </AgreementField>
  );
}

function PartySection({
  title,
  side,
  parties,
  onUpdate,
  onAdd,
  onRemove,
}: {
  title: string;
  side: 'sellers' | 'buyers';
  parties: SaleAgreementPartySnapshot[];
  onUpdate: (
    side: 'sellers' | 'buyers',
    key: string,
    patch: Partial<SaleAgreementPartySnapshot>,
  ) => void;
  onAdd: (side: 'sellers' | 'buyers', role: 'co_owner' | 'representative') => void;
  onRemove: (side: 'sellers' | 'buyers', key: string) => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Badge variant="secondary">{parties.length}명</Badge>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onAdd(side, 'co_owner')}>
            <CirclePlus data-icon="inline-start" />
            공동소유자 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAdd(side, 'representative')}
          >
            <CirclePlus data-icon="inline-start" />
            대리인 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 py-5">
        {parties.map((party, index) => (
          <div key={party.key} className="rounded-md border border-border/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {title} {index + 1}
              </p>
              {parties.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(side, party.key)}
                >
                  <Trash2 data-icon="inline-start" />
                  삭제
                </Button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AgreementField label="당사자 유형">
                <Select
                  value={party.partyType}
                  onValueChange={(value: 'individual' | 'corporation') =>
                    onUpdate(side, party.key, { partyType: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="individual">개인</SelectItem>
                      <SelectItem value="corporation">법인</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </AgreementField>
              <AgreementField label="역할">
                <Select
                  value={party.role}
                  onValueChange={(value: SaleAgreementPartySnapshot['role']) =>
                    onUpdate(side, party.key, { role: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="principal">본인</SelectItem>
                      <SelectItem value="co_owner">공동소유자</SelectItem>
                      <SelectItem value="representative">대리인</SelectItem>
                      <SelectItem value="corporate_representative">법인 대표자</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </AgreementField>
              <AgreementField label="성명/법인명" required>
                <Input
                  value={party.name}
                  onChange={(event) => onUpdate(side, party.key, { name: event.target.value })}
                />
              </AgreementField>
              <AgreementField label="식별정보 확인값">
                <Input
                  value={party.identificationNoMasked}
                  onChange={(event) =>
                    onUpdate(side, party.key, {
                      identificationNoMasked: event.target.value,
                    })
                  }
                  placeholder="예: 800101-1****** / 법인번호 마스킹값"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  원문 주민등록번호는 입력하지 말고 마스킹된 확인값만 기록하세요.
                </p>
              </AgreementField>
              <AgreementField label="주소" required className="xl:col-span-2">
                <Input
                  value={party.address}
                  onChange={(event) => onUpdate(side, party.key, { address: event.target.value })}
                />
              </AgreementField>
              <AgreementField label="전화">
                <Input
                  type="tel"
                  value={party.phone}
                  onChange={(event) => onUpdate(side, party.key, { phone: event.target.value })}
                />
              </AgreementField>
              <NumberAgreementField
                label="지분율"
                value={party.shareRatio}
                suffix="%"
                onChange={(value) => onUpdate(side, party.key, { shareRatio: value })}
              />
              {party.role === 'representative' ? (
                <AgreementField label="대리 대상 당사자" required>
                  <Input
                    value={party.representedPartyName}
                    onChange={(event) =>
                      onUpdate(side, party.key, {
                        representedPartyName: event.target.value,
                      })
                    }
                  />
                </AgreementField>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ResidentialSaleAgreementPreview({
  agreement,
  status,
}: {
  agreement: ResidentialSaleAgreementDraft;
  status: string;
}) {
  return (
    <div className="mx-auto min-h-[1123px] w-full max-w-[794px] border border-slate-200 bg-white px-10 py-10 text-slate-950 shadow-sm print:border-0 print:shadow-none">
      <div className="flex items-start justify-between gap-4 text-[10px] text-slate-500">
        <span>
          {agreement.schemaId} · v{agreement.schemaVersion}
        </span>
        <span>{status}</span>
      </div>
      <header className="mt-7 text-center">
        <h2 className="text-2xl font-semibold tracking-[0.16em]">부동산 매매계약서</h2>
        <p className="mt-3 text-xs text-slate-600">
          작성일 {formatDate(agreement.writtenAt)} · 실제 체결일{' '}
          {formatDate(agreement.actualAgreementAt)}
        </p>
      </header>

      <PreviewSection title="1. 부동산의 표시">
        <PreviewRow
          label="소재지"
          value={[agreement.property.roadAddress, agreement.property.jibunAddress]
            .filter(Boolean)
            .join(' / ')}
        />
        <PreviewRow label="매매 대상" value={agreement.property.targetDescription} />
        <PreviewRow
          label="토지"
          value={`${agreement.property.landCategory || '-'} · ${formatArea(agreement.property.landAreaM2)}`}
        />
        <PreviewRow
          label="건물"
          value={`${agreement.property.buildingStructure || '-'} / ${agreement.property.buildingUse || '-'} · ${formatArea(agreement.property.buildingAreaM2)}`}
        />
      </PreviewSection>

      <PreviewSection title="2. 매매대금과 지급">
        <PreviewRow label="매매대금" value={formatMoney(agreement.payment.totalPriceManwon)} />
        <PreviewRow
          label="계약금"
          value={`${formatMoney(agreement.payment.depositManwon)} · ${formatDate(agreement.payment.depositDueAt)}`}
        />
        <PreviewRow
          label="중도금"
          value={`${formatMoney(agreement.payment.interimManwon)} · ${formatDate(agreement.payment.interimDueAt)}`}
        />
        <PreviewRow
          label="잔금"
          value={`${formatMoney(agreement.payment.balanceManwon)} · ${formatDate(agreement.payment.balanceDueAt)}`}
        />
      </PreviewSection>

      <PreviewSection title="3. 인도·소유권 이전과 확인">
        <PreviewRow label="인도일" value={formatDate(agreement.transfer.deliveryAt)} />
        <PreviewRow
          label="소유권 이전일"
          value={formatDate(agreement.transfer.ownershipTransferAt)}
        />
        <PreviewRow
          label="확인설명서 교부"
          value={formatDate(agreement.transfer.explanationDeliveredAt)}
        />
        <PreviewRow
          label="권리관계 정리"
          value={agreement.transfer.rightsTransferDetails}
          multiline
        />
        <PreviewRow label="기타 조건" value={agreement.transfer.conditions} multiline />
      </PreviewSection>

      <PreviewSection title="4. 특약사항">
        <PreviewRow label="특약" value={agreement.specialTerms} multiline />
      </PreviewSection>

      <PreviewParties title="매도인" parties={agreement.sellers} />
      <PreviewParties title="매수인" parties={agreement.buyers} />

      <PreviewSection title="중개사무소">
        <PreviewRow
          label="사무소"
          value={`${agreement.brokerage.officeName} (${agreement.brokerage.registrationNo || '-'})`}
        />
        <PreviewRow
          label="개업공인중개사"
          value={`${agreement.brokerage.representativeName || '-'} (서명·날인)`}
        />
        <PreviewRow
          label="주소·전화"
          value={`${agreement.brokerage.address || '-'} / ${agreement.brokerage.phone || '-'}`}
        />
        <PreviewRow
          label="소속공인중개사"
          value={`${[agreement.brokerage.associateName, agreement.brokerage.associateLicenseNo].filter(Boolean).join(' / ') || '-'} (서명·날인)`}
        />
      </PreviewSection>

      <p className="mt-8 text-[10px] leading-4 text-slate-500">{agreement.sourceNotice}</p>
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">{title}</h3>
      <div className="mt-2 border border-slate-300">{children}</div>
    </section>
  );
}

function PreviewRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600">{label}</div>
      <div
        className={cn('min-h-8 px-3 py-2 text-xs leading-5', multiline && 'whitespace-pre-wrap')}
      >
        {value || ' '}
      </div>
    </div>
  );
}

function PreviewParties({
  title,
  parties,
}: {
  title: string;
  parties: SaleAgreementPartySnapshot[];
}) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">{title}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {parties.map((party) => (
          <div key={party.key} className="border border-slate-300 p-3 text-[11px] leading-5">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{party.name || ' '}</span>
              <span>(인)</span>
            </div>
            <p>{party.address || ' '}</p>
            <p>{party.phone || ' '}</p>
            <p className="text-slate-500">
              {party.identificationNoMasked || '식별정보 확인값 없음'}
              {party.shareRatio !== null ? ` · 지분 ${party.shareRatio}%` : ''}
            </p>
            {party.role === 'representative' ? (
              <p className="text-slate-500">대리 대상: {party.representedPartyName || '-'}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMoney(value: number | null) {
  return value === null ? '-' : formatPrice(value);
}

function formatArea(value: number | null) {
  return value === null ? '-' : `${value.toLocaleString('ko-KR')}m²`;
}

function formatDate(value: string) {
  return value || '-';
}
