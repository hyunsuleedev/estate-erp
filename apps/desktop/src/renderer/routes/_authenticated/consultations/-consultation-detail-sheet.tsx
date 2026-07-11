import { useState, type ComponentType, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardList,
  ExternalLink,
  FileAudio,
  Link2,
  ListChecks,
  Loader2,
  MessageSquareText,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatPhone } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, EntityChip } from '@/components/domain';
import { PurposeBadge, TypeBadge, getInitial } from './-consultation-badges';
import {
  getConsultationActionLabel,
  getConsultationContextCards,
  getConsultationOutcomeLabel,
  getConsultationPreview,
  getConsultationSignal,
  type ConsultationContextCard,
  type ConsultationListItem,
} from './-consultation-view-utils';

export function ConsultationDetailSheet({
  consultation,
  onEdit,
  onDeleted,
}: {
  consultation: ConsultationListItem;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const signal = getConsultationSignal(consultation);
  const contextCards = getConsultationContextCards(consultation);
  const actionLabel = getConsultationActionLabel(consultation);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.consultations.remove(consultation.id),
    onSuccess: () => {
      toast.success('상담 기록이 삭제되었습니다');
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
      setDeleteOpen(false);
      onDeleted();
    },
    onError: () => toast.error('상담 삭제에 실패했습니다'),
  });

  return (
    <>
      <SheetHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarFallback>{getInitial(consultation.contact?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-semibold text-slate-950">
              {consultation.contact?.name ?? '미지정 고객'}
            </SheetTitle>
            <SheetDescription className="truncate text-xs text-muted-foreground">
              {formatPhone(consultation.contact?.phone)}
            </SheetDescription>
          </div>
          <TypeBadge type={consultation.type} />
          <PurposeBadge purpose={consultation.purpose} showGeneral />
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <Button variant="outline" size="xs" className="gap-1" onClick={() => setTaskOpen(true)}>
            <ClipboardList className="size-3.5" />할 일 만들기
          </Button>
          <Button variant="outline" size="xs" className="gap-1" onClick={onEdit}>
            <Pencil className="size-3.5" />수정
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="gap-1 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />삭제
          </Button>
        </div>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div data-testid="consultation-detail-sheet" className="space-y-5 px-5 py-4">
          <PanelSection title="상담 결과">
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="업무 신호" value={signal.label} icon={MessageSquareText} className={signal.className} />
              <InfoTile label="결과" value={getConsultationOutcomeLabel(consultation)} icon={ListChecks} />
            </div>
          </PanelSection>

          {consultation.callRecordingId && (
            <PanelSection title="통화 녹음">
              <RecordingPanel recordingId={consultation.callRecordingId} />
            </PanelSection>
          )}

          <PanelSection title="연결 맥락">
            {contextCards.length > 0 ? (
              <div className="space-y-2">
                {contextCards.map((card) => (
                  <ConsultationContextLinkCard key={`${card.key}-${card.title}`} card={card} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-sm text-muted-foreground">
                연결된 매물, 의뢰, 매칭, 구매요건이 없습니다.
              </div>
            )}
          </PanelSection>

          <PanelSection title="후속 액션 후보">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
              <div className="flex items-start gap-2">
                <ListChecks className="mt-0.5 size-4 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-indigo-950">{actionLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-indigo-900/80">
                    이 상담에 연결된 할 일을 만들어 후속 업무로 이어갑니다.
                  </p>
                  <Button
                    variant="outline"
                    size="xs"
                    className="mt-3 gap-1 border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
                    onClick={() => setTaskOpen(true)}
                  >
                    <ClipboardList className="size-3.5" />이 상담으로 할 일 만들기
                  </Button>
                </div>
              </div>
            </div>
          </PanelSection>

          <PanelSection title="상담 전문">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{consultation.content}</p>
            </div>
          </PanelSection>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <MetaLine icon={CalendarClock} label={formatDateTime(consultation.createdAt)} />
              <MetaLine icon={UserRound} label={consultation.createdBy?.name ?? '담당자 미지정'} />
              <MetaLine icon={Phone} label={formatPhone(consultation.contact?.phone)} />
              <MetaLine icon={Building2} label={consultation.property?.site?.name ?? '매물 미연결'} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <EntityChip
                kind="contact"
                id={consultation.contact?.id ?? consultation.contactId}
                label={consultation.contact?.name ?? '미지정 고객'}
                sublabel={consultation.contact?.phone ? formatPhone(consultation.contact.phone) : undefined}
              />
              {consultation.propertyId && (
                <EntityChip
                  kind="property"
                  id={consultation.propertyId}
                  label={consultation.property?.site?.name ?? '매물'}
                  sublabel={consultation.property?.unit?.name ?? undefined}
                />
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="상담 기록을 삭제할까요?"
        description="삭제한 상담 기록은 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />

      <CreateTaskDialog open={taskOpen} onOpenChange={setTaskOpen} consultation={consultation} />
    </>
  );
}

// ----------------------------------------------------------------
// 통화 녹음 패널
// ----------------------------------------------------------------

const sttStatusLabels: Record<string, string> = {
  none: '녹음만 기록됨',
  pending: '변환 대기',
  processing: '텍스트 변환 중',
  completed: '변환 완료',
  failed: '변환 실패',
};

function RecordingPanel({ recordingId }: { recordingId: string }) {
  const { data: recording, isLoading, isError } = useQuery({
    queryKey: ['call-recording', recordingId],
    queryFn: () => api.callRecordings.findOne(recordingId),
  });

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-lg" />;
  }

  if (isError || !recording) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-muted-foreground">
        녹음 정보를 불러오지 못했습니다.{' '}
        <Link to="/calls" className="font-medium text-foreground underline underline-offset-2">
          통화기록에서 확인
        </Link>
      </div>
    );
  }

  const summary =
    typeof recording.analysis?.summary === 'string' ? recording.analysis.summary : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-background px-3 py-3">
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <FileAudio className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-950">
              {recording.direction === 'outbound' ? '발신' : '수신'} 통화
            </span>
            <Badge variant="outline" className="rounded-md px-1.5 text-[10px] text-slate-500">
              {sttStatusLabels[recording.sttStatus] ?? recording.sttStatus}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatPhone(recording.phoneNumber)} · {formatDuration(recording.durationSec)} ·{' '}
            {formatDateTime(recording.calledAt)}
          </div>
          {summary && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-700">{summary}</p>}
          {recording.messages.length > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">대화 {recording.messages.length}건 변환됨</div>
          )}
          <Button asChild variant="outline" size="xs" className="mt-2 gap-1">
            <Link to="/calls">
              <ExternalLink className="size-3" />
              통화기록 페이지에서 보기
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(durationSec: number) {
  if (!durationSec) return '0초';
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

// ----------------------------------------------------------------
// 상담 → 할 일 생성
// ----------------------------------------------------------------

function CreateTaskDialog({
  open,
  onOpenChange,
  consultation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultation: ConsultationListItem;
}) {
  const queryClient = useQueryClient();
  const defaultTitle = `상담 후속: ${consultation.contact?.name ?? '미지정 고객'}`;
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState(() => getConsultationPreview(consultation.content, 200));
  const [dueDate, setDueDate] = useState('');

  const createTask = useMutation({
    mutationFn: () =>
      api.tasks.create({
        title: title.trim(),
        content: content.trim() || undefined,
        source: 'manual',
        dueDate: dueDate || undefined,
        consultationId: consultation.id,
        contactId: consultation.contactId,
        propertyId: consultation.propertyId ?? undefined,
        listingIntakeId: consultation.listingIntakeId ?? undefined,
        listingId: consultation.listingId ?? undefined,
        matchId: consultation.matchId ?? undefined,
        buyerReqId: consultation.buyerReqId ?? undefined,
      }),
    onSuccess: () => {
      toast.success('할 일이 생성되었습니다');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
    },
    onError: () => toast.error('할 일 생성에 실패했습니다'),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !createTask.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base">상담으로 할 일 만들기</DialogTitle>
          <DialogDescription className="text-xs">
            이 상담과 연결된 고객·매물 정보가 할 일에 자동으로 연결됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">내용</Label>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-20 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">마감일</Label>
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={createTask.isPending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button size="sm" disabled={!title.trim() || createTask.isPending} onClick={() => createTask.mutate()}>
            {createTask.isPending && <Loader2 className="size-3.5 animate-spin" />}
            할 일 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------
// 연결 맥락 카드
// ----------------------------------------------------------------

export function ConsultationContextLinkCard({ card }: { card: ConsultationContextCard }) {
  const content = <ConsultationContextCardContent card={card} />;

  if (card.to === '/contacts/$id' && card.params) {
    return (
      <Link to="/contacts/$id" params={card.params} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  if (card.to === '/properties/$id' && card.params) {
    return (
      <Link to="/properties/$id" params={card.params} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  if (card.to === '/matches') {
    return (
      <Link
        to="/matches"
        search={card.search}
        className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {content}
      </Link>
    );
  }

  if (card.to === '/buyer-requirements/$id' && card.params) {
    return (
      <Link
        to="/buyer-requirements/$id"
        params={card.params}
        className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {content}
      </Link>
    );
  }

  if (card.to === '/buyer-requirements') {
    return (
      <Link to="/buyer-requirements" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
        {content}
      </Link>
    );
  }

  return (
    <Link to="/properties" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
      {content}
    </Link>
  );
}

function ConsultationContextCardContent({ card }: { card: ConsultationContextCard }) {
  const Icon = contextCardIcons[card.key] ?? Link2;

  return (
    <div className="group/context flex items-start gap-3 rounded-lg border border-slate-200 bg-background px-3 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50">
      <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', contextCardIconClasses[card.key])}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-md bg-white px-1.5 text-[10px] text-slate-500">
            {card.label}
          </Badge>
          <ExternalLink className="size-3 text-slate-300 transition-colors group-hover/context:text-slate-500" />
        </div>
        <div className="mt-1 truncate text-sm font-medium text-slate-950">{card.title}</div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{card.description}</div>
      </div>
    </div>
  );
}

const contextCardIcons: Record<ConsultationContextCard['key'], ComponentType<{ className?: string }>> = {
  contact: UserRound,
  property: Building2,
  listingIntake: ClipboardList,
  listing: Link2,
  match: ArrowRight,
  buyerRequirement: ListChecks,
};

const contextCardIconClasses: Record<ConsultationContextCard['key'], string> = {
  contact: 'bg-sky-50 text-sky-700',
  property: 'bg-emerald-50 text-emerald-700',
  listingIntake: 'bg-orange-50 text-orange-700',
  listing: 'bg-blue-50 text-blue-700',
  match: 'bg-violet-50 text-violet-700',
  buyerRequirement: 'bg-amber-50 text-amber-700',
};

// ----------------------------------------------------------------
// 작은 빌딩 블록
// ----------------------------------------------------------------

function InfoTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-current/70">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-current">{value}</div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function MetaLine({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
