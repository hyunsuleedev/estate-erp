import { Plus, Trash2 } from 'lucide-react';
import type { ContactPhone, ContactPhoneInput } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * ContactPhone[] 동적 행 편집기.
 * 기존 수정 다이얼로그가 전화 2개 슬롯만 지원하면서 3개 이상 번호가 소실되던
 * 데이터 손실 버그를 해결하기 위해 라벨/메모를 보존하는 행 단위 편집을 제공한다.
 */

export interface EditablePhone {
  /** React key (기존 번호는 서버 id, 신규는 로컬 시퀀스) */
  key: string;
  phone: string;
  label: string;
  isPrimary: boolean;
  /** 기존 레코드의 메모 보존용 (UI 편집 대상 아님) */
  memo: string | null;
}

let phoneRowSeq = 0;

export function createEmptyPhone(isPrimary = false): EditablePhone {
  phoneRowSeq += 1;
  return {
    key: `new-phone-${phoneRowSeq}`,
    phone: '',
    label: '',
    isPrimary,
    memo: null,
  };
}

/** 'mobile' 같은 내부 기본 라벨은 입력칸에 노출하지 않는다. */
function displayLabel(label: string) {
  return label === 'mobile' ? '' : label;
}

/**
 * Contact.phones[] → 편집 행 배열. phones가 비어 있으면 legacy phone 폴백,
 * 그것도 없으면 빈 행 1개(주 연락처)로 시작한다.
 */
export function toEditablePhones(contact: {
  phone?: string | null;
  phones?: ContactPhone[] | null;
}): EditablePhone[] {
  const fromPhones = (contact.phones ?? [])
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map<EditablePhone>((phone) => ({
      key: phone.id,
      phone: formatPhoneNumber(phone.phone),
      label: displayLabel(phone.label ?? ''),
      isPrimary: phone.isPrimary,
      memo: phone.memo ?? null,
    }));

  if (fromPhones.length > 0) return fromPhones;

  if (contact.phone) {
    phoneRowSeq += 1;
    return [
      {
        key: `legacy-${phoneRowSeq}`,
        phone: contact.phone,
        label: '',
        isPrimary: true,
        memo: null,
      },
    ];
  }

  return [createEmptyPhone(true)];
}

/**
 * 편집 행 → API 입력. 빈 번호 행은 제외하고, 주 연락처가 없으면 첫 행을 주 연락처로 승격한다.
 * 모든 행이 비어 있으면 빈 배열을 반환한다 (update 시 전화번호 전체 삭제 의도).
 */
export function toPhoneInputs(phones: EditablePhone[]): ContactPhoneInput[] {
  const cleaned = phones
    .filter((row) => row.phone.trim().length > 0)
    .map<ContactPhoneInput>((row) => ({
      phone: row.phone.trim(),
      label: row.label.trim() || undefined,
      isPrimary: row.isPrimary,
      memo: row.memo,
    }));

  if (cleaned.length > 0 && !cleaned.some((row) => row.isPrimary)) {
    cleaned[0] = { ...cleaned[0], isPrimary: true };
  }

  return cleaned;
}

/** 편집 행 중 첫 번째 유효 전화번호 (중복 확인 등에 사용). */
export function firstPhoneValue(phones: EditablePhone[]): string {
  return phones.find((row) => row.phone.trim().length > 0)?.phone.trim() ?? '';
}

export function ContactPhonesEditor({
  phones,
  onChange,
}: {
  phones: EditablePhone[];
  onChange: (next: EditablePhone[]) => void;
}) {
  const setPrimary = (key: string) => {
    onChange(phones.map((row) => ({ ...row, isPrimary: row.key === key })));
  };

  const updateRow = (key: string, patch: Partial<Pick<EditablePhone, 'phone' | 'label'>>) => {
    onChange(phones.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    const next = phones.filter((row) => row.key !== key);
    if (next.length > 0 && !next.some((row) => row.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    onChange(next.length > 0 ? next : [createEmptyPhone(true)]);
  };

  return (
    <div className="space-y-2">
      {phones.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPrimary(row.key)}
            title={row.isPrimary ? '주 연락처' : '주 연락처로 지정'}
            className={cn(
              'shrink-0 rounded-[4px] border px-1.5 py-1 text-[11px] font-medium transition-colors',
              row.isPrimary
                ? 'border-transparent bg-[#e7f3f8] text-[#337ea9]'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            주
          </button>
          <Input
            type="tel"
            value={row.phone}
            onChange={(event) => updateRow(row.key, { phone: event.target.value })}
            placeholder="010-1234-5678"
            className="min-w-0 flex-1"
          />
          <Input
            type="text"
            value={row.label}
            onChange={(event) => updateRow(row.key, { label: event.target.value })}
            placeholder="라벨 (사무실)"
            className="w-28 shrink-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(row.key)}
            aria-label="전화번호 삭제"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        onClick={() => onChange([...phones, createEmptyPhone(phones.length === 0)])}
      >
        <Plus className="size-3.5" />
        전화번호 추가
      </Button>
    </div>
  );
}
