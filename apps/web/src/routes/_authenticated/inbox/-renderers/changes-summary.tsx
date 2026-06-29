/**
 * contract_draft 외 카테고리 공용 렌더러.
 *
 * 카테고리별 proposedChanges 는 AI 가 자유롭게 생성하는 구조이므로
 * (1) 알려진 키는 한국어 라벨 + 도메인 포맷(금액/날짜/상태 뱃지)으로,
 * (2) 모르는 키는 라벨 없이 key 그대로,
 * (3) 복잡한 중첩 구조는 JSON 으로 우아하게 강등해 표시한다.
 * 편집 모드에서는 최상위 원시 필드를 인라인 편집할 수 있다.
 */

import { MessageCircle, Send } from 'lucide-react';
import { StatusBadge } from '@/components/domain';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatMoney } from '@/lib/format';

// ── 필드 사전 ───────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  content: '내용',
  memo: '메모',
  message: '메시지',
  body: '메시지',
  reason: '사유',
  description: '설명',
  dueDate: '마감일',
  date: '날짜',
  scheduledAt: '예정 일시',
  priority: '우선순위',
  category: '카테고리',
  status: '상태',
  checkStatus: '확인 상태',
  transactionType: '거래유형',
  price: '가격',
  deposit: '보증금',
  monthlyRent: '월세',
  totalPrice: '총액',
  amount: '금액',
  adjustmentAmount: '조정 금액',
  commissionTotal: '수수료 총액',
  commissionSellerAmount: '매도측 수수료',
  commissionBuyerAmount: '매수측 수수료',
  maintenanceFee: '관리비',
  loanAmount: '융자금',
  premium: '권리금',
  isHidden: '목록 숨김',
  articleNo: '매물번호',
  channel: '광고 채널',
  cpName: '광고 채널',
  adTitle: '광고 제목',
  siteName: '단지명',
  recipient: '수신자',
  recipientName: '수신자',
  phone: '전화번호',
  specialTerms: '특약사항',
};

const MONEY_KEYS = new Set([
  'price',
  'deposit',
  'monthlyRent',
  'totalPrice',
  'amount',
  'adjustmentAmount',
  'commissionTotal',
  'commissionSellerAmount',
  'commissionBuyerAmount',
  'maintenanceFee',
  'loanAmount',
  'premium',
  'statedDeposit',
  'statedInterimPayment',
  'statedBalance',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

type Primitive = string | number | boolean;

function isPrimitive(v: unknown): v is Primitive {
  return (
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** 표시 대상 엔트리 (내부 키/시스템 키 제외) */
function displayEntries(
  changes: Record<string, unknown>,
): Array<[string, unknown]> {
  return Object.entries(changes).filter(
    ([k]) => !k.startsWith('_') && k !== 'items',
  );
}

/** 인라인 편집 가능한 최상위 원시 필드 */
function editableEntries(
  changes: Record<string, unknown>,
): Array<[string, Primitive]> {
  return displayEntries(changes).filter(
    (entry): entry is [string, Primitive] =>
      isPrimitive(entry[1]) && !entry[0].endsWith('Id'),
  );
}

export function hasEditableFields(changes: Record<string, unknown>): boolean {
  return editableEntries(changes).length > 0;
}

// ── 값 렌더링 ───────────────────────────────────────────────────────────

function ValueDisplay({ k, v }: { k: string; v: unknown }) {
  if (v == null || v === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof v === 'boolean') return <>{v ? '예' : '아니오'}</>;
  if (k === 'checkStatus') {
    return <StatusBadge kind="checkStatus" status={String(v)} size="sm" />;
  }
  if (k === 'transactionType') {
    return <StatusBadge kind="transactionType" status={String(v)} size="sm" />;
  }
  if (typeof v === 'number' && MONEY_KEYS.has(k)) {
    return <span className="tabular-nums">{formatMoney(v)}</span>;
  }
  if (typeof v === 'string' && ISO_DATE_RE.test(v)) {
    return <>{formatDate(v)}</>;
  }
  if (Array.isArray(v) && v.every((p) => !p || typeof p !== 'object')) {
    return <>{v.length > 0 ? v.join(', ') : '—'}</>;
  }
  if (typeof v === 'object') {
    return (
      <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px]">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  }
  if (typeof v === 'string' && (v.includes('\n') || v.length > 80)) {
    return <p className="whitespace-pre-wrap">{v}</p>;
  }
  if (typeof v === 'string' && k.endsWith('Id')) {
    return <span className="font-mono text-[11px] opacity-70">{v}</span>;
  }
  return <>{String(v)}</>;
}

function FieldRow({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-[13px]">
      <div className="w-28 shrink-0 text-muted-foreground">{fieldLabel(k)}</div>
      <div className="min-w-0 flex-1">
        <ValueDisplay k={k} v={v} />
      </div>
    </div>
  );
}

function GenericFieldList({ changes }: { changes: Record<string, unknown> }) {
  const entries = displayEntries(changes);
  if (entries.length === 0) {
    return (
      <pre className="overflow-x-auto rounded-md bg-background p-3 text-[11px]">
        {JSON.stringify(changes, null, 2)}
      </pre>
    );
  }
  return (
    <div className="divide-y rounded-md border bg-background px-3 py-1">
      {entries.map(([k, v]) => (
        <FieldRow key={k} k={k} v={v} />
      ))}
    </div>
  );
}

// ── 카테고리 특화 ───────────────────────────────────────────────────────

/** send_kakao — 발송 메시지 미리보기 */
function KakaoMessagePreview({ changes }: { changes: Record<string, unknown> }) {
  const message =
    (changes.message as string | undefined) ??
    (changes.body as string | undefined) ??
    (changes.text as string | undefined) ??
    (changes.content as string | undefined);
  const recipient =
    (changes.recipientName as string | undefined) ??
    (changes.recipient as string | undefined) ??
    (changes.to as string | undefined);
  const rest = Object.fromEntries(
    displayEntries(changes).filter(
      ([k]) =>
        !['message', 'body', 'text', 'content', 'recipientName', 'recipient', 'to'].includes(k),
    ),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Send className="size-3" />
          발송 메시지 미리보기
          {recipient && <span className="font-normal normal-case">· 받는 사람: {recipient}</span>}
        </div>
        {message ? (
          <div className="flex items-start gap-2">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="whitespace-pre-wrap rounded-lg rounded-tl-none border bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">
              {message}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">메시지 본문이 없습니다.</p>
        )}
      </div>
      {Object.keys(rest).length > 0 && <GenericFieldList changes={rest} />}
    </div>
  );
}

/** check_status_update — 확인 상태 전환 강조 */
function CheckStatusUpdateView({ changes }: { changes: Record<string, unknown> }) {
  const next = changes.checkStatus as string | undefined;
  const rest = Object.fromEntries(
    displayEntries(changes).filter(([k]) => k !== 'checkStatus'),
  );
  return (
    <div className="space-y-3">
      {next && (
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2.5 text-[13px]">
          <span className="text-muted-foreground">확인 상태 변경</span>
          <span className="text-muted-foreground">→</span>
          <StatusBadge kind="checkStatus" status={next} />
        </div>
      )}
      {Object.keys(rest).length > 0 && <GenericFieldList changes={rest} />}
    </div>
  );
}

// ── 인라인 편집기 ───────────────────────────────────────────────────────

function GenericChangesEditor({
  changes,
  onChange,
}: {
  changes: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const editable = editableEntries(changes);
  const skippedCount = displayEntries(changes).length - editable.length;

  const setField = (key: string, value: unknown) => {
    onChange({ ...changes, [key]: value });
  };

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div className="grid grid-cols-2 gap-3">
        {editable.map(([k, v]) => {
          const label = fieldLabel(k);
          if (typeof v === 'boolean') {
            return (
              <div key={k} className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-[11px]">{label}</Label>
                <Switch checked={v} onCheckedChange={(c) => setField(k, c)} />
              </div>
            );
          }
          if (typeof v === 'number') {
            return (
              <div key={k} className="space-y-1">
                <Label className="text-[11px]">
                  {label}
                  {MONEY_KEYS.has(k) && ' (만원)'}
                </Label>
                <Input
                  type="number"
                  value={v}
                  onChange={(e) => setField(k, Number(e.target.value))}
                />
              </div>
            );
          }
          // string
          if (v.includes('\n') || v.length > 80) {
            return (
              <div key={k} className="col-span-2 space-y-1">
                <Label className="text-[11px]">{label}</Label>
                <Textarea
                  value={v}
                  rows={5}
                  onChange={(e) => setField(k, e.target.value)}
                  className="text-[13px]"
                />
              </div>
            );
          }
          return (
            <div key={k} className="space-y-1">
              <Label className="text-[11px]">{label}</Label>
              <Input value={v} onChange={(e) => setField(k, e.target.value)} />
            </div>
          );
        })}
      </div>
      {skippedCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          중첩 구조 항목 {skippedCount}개는 인라인 편집을 지원하지 않습니다.
        </p>
      )}
    </div>
  );
}

// ── 엔트리 포인트 ───────────────────────────────────────────────────────

export function ChangesView({
  category,
  changes,
  editMode,
  onChange,
}: {
  category: string;
  changes: Record<string, unknown>;
  editMode: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  if (editMode) {
    return <GenericChangesEditor changes={changes} onChange={onChange} />;
  }
  if (category === 'send_kakao') {
    return <KakaoMessagePreview changes={changes} />;
  }
  if (category === 'check_status_update') {
    return <CheckStatusUpdateView changes={changes} />;
  }
  // ad_takedown / post_naver_ad / naver_ad_repost / commission_adjustment /
  // followup_task 등 — 구조화 필드 리스트로 표시
  return <GenericFieldList changes={changes} />;
}
