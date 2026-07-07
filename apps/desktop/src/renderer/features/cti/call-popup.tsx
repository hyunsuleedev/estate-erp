import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Building2,
  CalendarClock,
  ClipboardList,
  Loader2,
  MessageSquarePlus,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useCti, type ActiveCall } from './cti-provider';

function formatPhone(phone: string): string {
  if (/^01\d{9}$/.test(phone)) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }
  if (/^0\d{9}$/.test(phone)) {
    return `${phone.slice(0, 2)}-${phone.slice(2, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatWon(manwon: number | null): string | null {
  if (manwon === null) return null;
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1)}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

const transactionTypeLabel: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

function buyerRequirementSummary(
  req: NonNullable<ActiveCall['lookup']>['buyerRequirement'],
): string | null {
  if (!req) return null;
  const parts: string[] = [];
  if (req.transactionType) {
    parts.push(transactionTypeLabel[req.transactionType] ?? req.transactionType);
  }
  const priceMax = formatWon(req.priceMax);
  const depositMax = formatWon(req.depositMax);
  if (priceMax) parts.push(`~${priceMax}`);
  else if (depositMax) parts.push(`보증금 ~${depositMax}`);
  if (req.monthlyRentMax) parts.push(`월 ~${req.monthlyRentMax}만`);
  return parts.length > 0 ? parts.join(' · ') : '조건 등록됨';
}

function PhaseHeader({ call }: { call: ActiveCall }) {
  if (call.phase === 'ringing') {
    return (
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <span className="relative flex size-5 items-center justify-center">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <PhoneIncoming className="relative size-4" />
        </span>
        <span className="text-sm font-semibold">전화 수신 중</span>
      </div>
    );
  }
  if (call.phase === 'missed') {
    return (
      <div className="flex items-center gap-2 text-red-500">
        <PhoneMissed className="size-4" />
        <span className="text-sm font-semibold">부재중 전화</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <PhoneOff className="size-4" />
      <span className="text-sm font-semibold">
        통화 종료 · {formatDuration(call.durationSec)}
      </span>
    </div>
  );
}

function ConsultationForm({
  call,
  contactId,
  onDone,
}: {
  call: ActiveCall;
  contactId: string;
  onDone: () => void;
}) {
  const { patchCallLog } = useCti();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const consultation = await api.consultations.create({
        contactId,
        type: 'phone',
        content: content.trim(),
      });
      if (call.callLog) {
        await api.cti.updateCallLog(call.callLog.id, {
          consultationId: consultation.id,
        });
        patchCallLog({ consultationId: consultation.id });
      }
      toast.success('상담이 기록되었습니다');
      onDone();
    } catch (error) {
      console.error('[cti] 상담 기록 실패:', error);
      toast.error('상담 기록에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="상담 내용을 입력하세요..."
        className="min-h-20 text-sm"
        data-testid="cti-consultation-content"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>
          취소
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !content.trim()}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          상담 저장
        </Button>
      </div>
    </div>
  );
}

function QuickContactForm({
  call,
  onDone,
}: {
  call: ActiveCall;
  onDone: () => void;
}) {
  const { refreshLookup, patchCallLog } = useCti();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const contact = await api.contacts.create({
        name: name.trim(),
        phones: [{ phone: call.phoneNumber, label: 'mobile', isPrimary: true }],
      });
      if (call.callLog) {
        await api.cti.updateCallLog(call.callLog.id, { contactId: contact.id });
        patchCallLog({ contactId: contact.id, contact: { id: contact.id, name: contact.name } });
      }
      toast.success(`연락처 "${contact.name}" 등록됨`);
      await refreshLookup();
      onDone();
    } catch (error) {
      console.error('[cti] 연락처 등록 실패:', error);
      toast.error('연락처 등록에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
        }}
        placeholder="고객 이름"
        className="h-8 text-sm"
        data-testid="cti-contact-name"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>
          취소
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          등록
        </Button>
      </div>
    </div>
  );
}

function LookupBody({ call }: { call: ActiveCall }) {
  const lookup = call.lookup;

  if (call.lookupLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        고객 정보 조회 중...
      </div>
    );
  }
  if (!lookup) return null;

  const requirementSummary = buyerRequirementSummary(lookup.buyerRequirement);
  const lastConsultation = lookup.recentConsultations[0];

  return (
    <div className="space-y-2.5">
      {lookup.vendorContacts.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div>
            {lookup.vendorContacts.map((vc) => (
              <div key={vc.id}>
                <span className="font-medium">{vc.vendor.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  {vc.name}
                  {vc.role ? ` · ${vc.role}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastConsultation && (
        <div className="flex items-start gap-2 text-sm">
          <MessageSquarePlus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-muted-foreground">{lastConsultation.content}</p>
            <p className="text-xs text-muted-foreground/70">
              최근 상담 · {new Date(lastConsultation.createdAt).toLocaleDateString('ko-KR')}
            </p>
          </div>
        </div>
      )}

      {lookup.properties.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-wrap gap-1">
            {lookup.properties.map((pc, i) => {
              const { property } = pc;
              const dongName =
                property.unit?.dong && !property.unit.dong.isPlaceholder
                  ? ` ${property.unit.dong.name}`
                  : '';
              const unitName = property.unit ? ` ${property.unit.name}` : '';
              return (
                <Badge key={`${property.id}-${i}`} variant="secondary" className="font-normal">
                  {property.site.name}
                  {dongName}
                  {unitName}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {requirementSummary && (
        <div className="flex items-start gap-2 text-sm">
          <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">구하는 조건: {requirementSummary}</span>
        </div>
      )}

      {lookup.openTasks.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            {lookup.openTasks.slice(0, 2).map((task) => (
              <p key={task.id} className="truncate text-muted-foreground">
                {task.title}
              </p>
            ))}
            {lookup.openTasks.length > 2 && (
              <p className="text-xs text-muted-foreground/70">
                외 {lookup.openTasks.length - 2}건의 미완료 업무
              </p>
            )}
          </div>
        </div>
      )}

      {lookup.recentCalls.length > 1 && (
        <p className="text-xs text-muted-foreground/70">
          최근 통화 {lookup.recentCalls.length}건 —{' '}
          <Link
            to="/calls/logs"
            search={{ phone: lookup.phone }}
            className="underline underline-offset-2 hover:text-foreground"
          >
            이력 보기
          </Link>
        </p>
      )}
    </div>
  );
}

export function CallPopup() {
  const { activeCall, dismiss } = useCti();
  const [mode, setMode] = useState<'view' | 'consultation' | 'contact'>('view');

  // 새 통화가 오면 편집 모드 초기화
  useEffect(() => {
    setMode('view');
  }, [activeCall?.key]);

  if (!activeCall) return null;

  const lookup = activeCall.lookup;
  const contact = lookup?.contact ?? null;
  const isNew = lookup ? lookup.isNew : false;
  const displayName =
    contact?.name ??
    lookup?.vendorContacts[0]?.vendor.name ??
    formatPhone(activeCall.phoneNumber);

  return (
    <div
      data-testid="cti-call-popup"
      className={cn(
        'fixed bottom-4 right-4 z-50 w-90 rounded-xl border bg-popover text-popover-foreground shadow-2xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <PhaseHeader call={activeCall} />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={dismiss}
          data-testid="cti-popup-close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-4 pb-1 pt-2">
        <div className="flex items-center gap-2">
          <p className="truncate text-lg font-semibold" data-testid="cti-caller-name">
            {displayName}
          </p>
          {isNew && !activeCall.lookupLoading && (
            <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-600">
              신규
            </Badge>
          )}
          {contact?.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="shrink-0 font-normal">
              {tag}
            </Badge>
          ))}
        </div>
        {(contact || lookup?.vendorContacts.length) ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3" />
            {formatPhone(activeCall.phoneNumber)}
          </p>
        ) : null}
      </div>

      <div className="px-4 py-2">
        <LookupBody call={activeCall} />
      </div>

      <Separator />

      <div className="px-4 py-3">
        {mode === 'consultation' && contact ? (
          <ConsultationForm
            call={activeCall}
            contactId={contact.id}
            onDone={() => setMode('view')}
          />
        ) : mode === 'contact' ? (
          <QuickContactForm call={activeCall} onDone={() => setMode('view')} />
        ) : (
          <div className="flex gap-2">
            {contact ? (
              <>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => setMode('consultation')}
                  data-testid="cti-action-consultation"
                >
                  <MessageSquarePlus className="size-3.5" />
                  상담 기록
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/contacts" onClick={dismiss}>
                    고객 상세
                  </Link>
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="flex-1"
                variant={isNew ? 'default' : 'outline'}
                disabled={activeCall.lookupLoading}
                onClick={() => setMode('contact')}
                data-testid="cti-action-register"
              >
                <UserPlus className="size-3.5" />
                연락처 등록
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
