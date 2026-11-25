import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Handshake,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PartnerBroker } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { formatPhoneWhileTyping } from '@/lib/phone-format';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DetailField,
  EmptyState,
  EntityChip,
  MoneyText,
  StatusBadge,
} from '@/components/domain';
import { CopyIconButton } from './-copy-button';
import {
  dealAddressLabel,
  dealPriceLabel,
  getPartnerDeals,
  getPartnerDistributions,
  summarizePartnerShare,
  usePartnerDeals,
  type DealWithCommission,
} from './-broker-utils';

export function BrokerDetailSheet({
  broker,
  onClose,
  onEdit,
  onToggleActive,
}: {
  broker: PartnerBroker | null;
  onClose: () => void;
  onEdit: (broker: PartnerBroker) => void;
  onToggleActive: (broker: PartnerBroker) => void;
}) {
  return (
    <Sheet open={!!broker} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-[560px]"
      >
        {broker && (
          <BrokerSheetBody
            broker={broker}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function BrokerSheetBody({
  broker,
  onEdit,
  onToggleActive,
}: {
  broker: PartnerBroker;
  onEdit: (broker: PartnerBroker) => void;
  onToggleActive: (broker: PartnerBroker) => void;
}) {
  const dealsQuery = usePartnerDeals();

  const partnerDeals = useMemo(
    () => getPartnerDeals(dealsQuery.data ?? [], broker.id),
    [dealsQuery.data, broker.id],
  );

  const shareSummary = useMemo(
    () => summarizePartnerShare(partnerDeals, broker.id),
    [partnerDeals, broker.id],
  );

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <SheetTitle className="text-base">{broker.name}</SheetTitle>
          {!broker.isActive && <BadgeChip tone="gray">비활성</BadgeChip>}
          <BadgeChip tone={broker.linkedOfficeId ? 'green' : 'gray'}>
            {broker.linkedOfficeId ? 'ERP 가입' : '외부'}
          </BadgeChip>
        </div>
        <SheetDescription>
          공동중개 파트너 상세 · 등록일 {formatDate(broker.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* 기본 정보 */}
        <section className="space-y-0.5">
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">기본 정보</h3>
          <DetailField label="대표자" value={broker.ceoName ?? undefined} />
          <DetailField label="등록번호">
            {broker.licenseNo ? (
              <span className="tabular-nums">{broker.licenseNo}</span>
            ) : undefined}
          </DetailField>
          <DetailField label="대표폰">
            {broker.ceoPhone ? <PhoneValue phone={broker.ceoPhone} /> : undefined}
          </DetailField>
          <DetailField label="사무소 전화">
            {broker.phone ? <PhoneValue phone={broker.phone} /> : undefined}
          </DetailField>
          <DetailField label="이메일">
            {broker.email ? (
              <span className="flex items-center gap-1">
                <a href={`mailto:${broker.email}`} className="truncate hover:underline">
                  {broker.email}
                </a>
                <CopyIconButton value={broker.email} label="이메일" />
              </span>
            ) : undefined}
          </DetailField>
          <DetailField label="주소" value={broker.address ?? undefined} />
          <DetailField label="메모">
            {broker.memo ? (
              <span className="whitespace-pre-wrap">{broker.memo}</span>
            ) : undefined}
          </DetailField>
          <DetailField label="수정일" value={formatDate(broker.updatedAt)} />
        </section>

        {/* 담당자 목록 */}
        <PartnerBrokerContactsSection broker={broker} />

        {/* 공동중개 거래 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">
              공동중개 거래 {dealsQuery.data ? `${partnerDeals.length}건` : ''}
            </h3>
            <Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs">
              <Link to="/deals">
                거래 페이지 열기
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          </div>

          {/* 분배 합계 요약 */}
          {shareSummary.total > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2 rounded-md border bg-muted/50 p-2.5 text-center">
              <SummaryStat label="분배 합계" value={shareSummary.total} />
              <SummaryStat label="정산완료" value={shareSummary.settled} valueClassName="text-success" />
              <SummaryStat label="정산대기" value={shareSummary.pending} valueClassName="text-warning" />
            </div>
          )}

          {dealsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : dealsQuery.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="거래 내역을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
              action={
                <Button variant="outline" size="sm" onClick={() => void dealsQuery.refetch()}>
                  다시 시도
                </Button>
              }
              className="py-8"
            />
          ) : partnerDeals.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="연결된 거래가 없습니다"
              description="거래 등록 시 공동중개 파트너로 이 사무소를 선택하면 여기에 표시됩니다."
              className="py-8"
            />
          ) : (
            <ul className="space-y-2">
              {partnerDeals.map((deal) => (
                <PartnerDealCard key={deal.id} deal={deal} brokerId={broker.id} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <Button variant="outline" size="sm" onClick={() => onEdit(broker)}>
          <Pencil className="size-3.5" />
          정보 수정
        </Button>
        {broker.isActive ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onToggleActive(broker)}
          >
            <Trash2 className="size-3.5" />
            비활성화
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onToggleActive(broker)}>
            <RotateCcw className="size-3.5" />
            재활성화
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function PartnerDealCard({
  deal,
  brokerId,
}: {
  deal: DealWithCommission;
  brokerId: string;
}) {
  const entries = getPartnerDistributions(deal, brokerId);

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind="transactionType" status={deal.transactionType} size="sm" />
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
        {deal.isCancelled && (
          <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-xs font-medium text-destructive">
            취소
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(deal.createdAt)}
        </span>
      </div>

      <EntityChip
        kind="deal"
        id={deal.id}
        label={dealAddressLabel(deal)}
        sublabel={dealPriceLabel(deal)}
      />

      {entries.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {entries.map(({ payment, distribution }) => (
            <div
              key={distribution.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">
                {payment.clientSide === 'seller' ? '매도측' : '매수측'} 수수료 분배{' '}
                {Number(distribution.shareRatio)}%
              </span>
              <span className="flex items-center gap-1.5">
                <MoneyText value={distribution.shareAmount} className="text-xs font-medium" />
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-medium',
                    distribution.status === 'settled'
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft text-warning',
                  )}
                >
                  {distribution.status === 'settled' ? '정산완료' : '정산대기'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function PartnerBrokerContactsSection({ broker }: { broker: PartnerBroker }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const contacts = broker.contacts ?? [];

  const addMutation = useMutation({
    mutationFn: () =>
      api.partnerBrokers.addContact(broker.id, {
        name: name.trim(),
        phone: phone.trim(),
        role: role.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('담당자를 추가했습니다.');
      setName('');
      setPhone('');
      setRole('');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '담당자를 추가하지 못했습니다.')),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.partnerBrokers.updateContact(broker.id, contactId, { isPrimary: true }),
    onSuccess: () => {
      toast.success('대표 담당자를 변경했습니다.');
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '대표 담당자를 변경하지 못했습니다.')),
  });

  const removeMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.partnerBrokers.removeContact(broker.id, contactId),
    onSuccess: () => {
      toast.success('담당자를 삭제했습니다.');
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '담당자를 삭제하지 못했습니다.')),
  });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">
          담당자 {contacts.length > 0 ? `${contacts.length}명` : ''}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-xs"
          onClick={() => setAdding((prev) => !prev)}
        >
          <Plus className="size-3" />
          {adding ? '닫기' : '담당자 추가'}
        </Button>
      </div>

      {adding && (
        <form
          className="mb-3 space-y-2 rounded-md border bg-muted/30 p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !phone.trim()) return;
            addMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 *"
              className="h-8 text-xs"
            />
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="직책 (예: 실장)"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Input
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(formatPhoneWhileTyping(e.target.value))}
              placeholder="전화번호 *"
              className="h-8 flex-1 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs"
              disabled={addMutation.isPending || !name.trim() || !phone.trim()}
            >
              추가
            </Button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 담당자가 없습니다.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate font-medium">{contact.name}</span>
                  {contact.role && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {contact.role}
                    </span>
                  )}
                  {contact.isPrimary && (
                    <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info">
                      대표
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  <PhoneValue phone={contact.phone} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!contact.isPrimary && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="대표 담당자로 지정"
                    onClick={() => setPrimaryMutation.mutate(contact.id)}
                  >
                    <Star className="size-3.5" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  title="담당자 삭제"
                  onClick={() => removeMutation.mutate(contact.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PhoneValue({ phone }: { phone: string }) {
  return (
    <span className="flex items-center gap-1">
      <a
        href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
        className="tabular-nums hover:underline"
      >
        {formatPhone(phone)}
      </a>
      <CopyIconButton value={formatPhone(phone)} label="전화번호" />
    </span>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <MoneyText value={value} className={cn('text-sm font-medium', valueClassName)} />
    </div>
  );
}

function BadgeChip({
  tone,
  children,
}: {
  tone: 'green' | 'gray';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        tone === 'green' ? 'bg-[#eef3ed] text-[#44745a]' : 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      {children}
    </span>
  );
}
