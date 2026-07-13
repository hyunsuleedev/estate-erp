import { useEffect, useReducer } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  FileText,
  GitCommitHorizontal,
  Hash,
  History,
  LockKeyhole,
  MessageSquareText,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  INITIAL_HITL_PREVIEW_STATE,
  hitlPreviewReducer,
  type HitlActivity,
  type HitlPhase,
} from '@/features/hitl-preview/model';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ContractDocumentPreview } from './_authenticated/inbox/-renderers/contract-document';

export const Route = createFileRoute('/dev/hitl-preview')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' });
    }
  },
  component: HitlPreviewPage,
});

const PHASE_META: Record<
  HitlPhase,
  { label: string; description: string; badgeClass: string }
> = {
  awaiting_review: {
    label: '사람 확인 대기',
    description: 'AI 실행은 멈췄고 최종 책임자의 판단을 기다립니다.',
    badgeClass: 'bg-warning-soft text-warning',
  },
  agent_working: {
    label: 'AI 수정 중',
    description: '수정 지시를 반영해 새 불변 리비전을 만들고 있습니다.',
    badgeClass: 'bg-violet-soft text-violet',
  },
  approved: {
    label: '승인 완료',
    description: '사람이 정확한 리비전과 내용 해시를 확인했습니다.',
    badgeClass: 'bg-success-soft text-success',
  },
};

const SECONDARY_QUEUE_ITEMS = [
  {
    title: '고덕아르테온 203동 임대차계약서',
    summary: '보증금 5억 · 임대기간 2년',
    status: 'AI 작업 중',
    statusClass: 'bg-violet-soft text-violet',
    time: '3분 전',
  },
  {
    title: '래미안힐스테이트 112동 매매계약서',
    summary: '리비전 #2 · 주의사항 없음',
    status: '처리 완료',
    statusClass: 'bg-success-soft text-success',
    time: '어제',
  },
];

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function HitlPreviewPage() {
  const [state, dispatch] = useReducer(
    hitlPreviewReducer,
    INITIAL_HITL_PREVIEW_STATE,
  );
  const phase = PHASE_META[state.phase];

  useEffect(() => {
    if (state.phase !== 'agent_working') return;

    const timer = window.setTimeout(() => {
      dispatch({ type: 'agent_returned' });
      toast.success('AI가 수정한 새 리비전을 검토함에 올렸습니다.');
    }, 1_600);

    return () => window.clearTimeout(timer);
  }, [state.phase]);

  const requestRevision = () => {
    if (!state.instruction.trim()) {
      toast.error('AI에게 전달할 수정 내용을 입력해 주세요.');
      return;
    }
    dispatch({ type: 'revision_requested' });
    toast.message('수정 요청을 전달했습니다. AI 실행을 다시 깨웁니다.');
  };

  const approveRevision = () => {
    dispatch({ type: 'revision_approved' });
    toast.success(`리비전 #${state.revisionNo}을 확인하고 승인했습니다.`);
  };

  const resetPreview = () => {
    dispatch({ type: 'reset' });
    toast.message('예시를 처음 상태로 되돌렸습니다.');
  };

  const contractChanges = {
    transactionType: 'sale',
    totalPrice: 158_000,
    statedDeposit: 15_000,
    statedInterimPayment: 30_000,
    statedInterimDate: '2026-08-01T00:00:00.000Z',
    statedBalance: 113_000,
    statedBalanceDate: state.balanceDate,
    contractDate: '2026-07-13T00:00:00.000Z',
    specialTerms:
      '1. 현 시설 상태의 매매계약이며, 등기부등본상 권리관계는 잔금일까지 현 상태를 유지한다.\n2. 매도인은 잔금 수령과 동시에 소유권이전등기에 필요한 서류를 교부한다.\n3. 잔금일은 당사자 합의로 2026년 9월 5일까지 조정할 수 있다.',
    _document: {
      propertyAddress:
        '서울특별시 강동구 고덕로 333, 고덕그라시움 101동 1201호',
      buildingStructure: '철근콘크리트조',
      buildingUse: '공동주택(아파트)',
      landShareNumerator: 42.18,
      landShareDenominator: 52_340.2,
      landAreaM2: 42.18,
      exclusiveAreaM2: 84.97,
      sellerName: '이매도',
      sellerAddress: '서울특별시 강동구 고덕로 333',
      sellerRrn: '780101-1******',
      sellerPhone: '010-1234-5678',
      buyerName: '박매수',
      buyerAddress: '서울특별시 송파구 올림픽로 300',
      buyerRrn: '850505-2******',
      buyerPhone: '010-9876-5432',
      handoverDate: state.balanceDate,
    },
  };

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileCheck2 className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">Estate ERP</span>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  인터랙티브 예시
                </Badge>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Paperclip식 Human-in-the-loop 계약 검토
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetPreview}>
            <RotateCcw data-icon="inline-start" />
            처음부터
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1800px] flex-col gap-4 p-4 lg:p-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className={phase.badgeClass}>
              {state.phase === 'agent_working' ? (
                <RefreshCcw className="animate-spin" />
              ) : state.phase === 'approved' ? (
                <CheckCircle2 />
              ) : (
                <Clock3 />
              )}
              {phase.label}
            </Badge>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              사람이 승인하고, AI가 실행하는 계약 검토
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              업무함을 별도 할 일 목록으로 만들지 않고 계약서 자체를 중심에 둡니다.
              사람은 최종 책임자로 남고, AI는 위임받은 작업을 실행한 뒤 정확한 리비전에서
              멈춥니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:w-[540px]">
            <FlowStep label="자료 수집" state="done" />
            <FlowStep
              label="AI 작성·검증"
              state={state.phase === 'agent_working' ? 'active' : 'done'}
            />
            <FlowStep
              label="사람 검토"
              state={
                state.phase === 'awaiting_review'
                  ? 'active'
                  : state.phase === 'approved'
                    ? 'done'
                    : 'upcoming'
              }
            />
            <FlowStep
              label="계약에 반영"
              state={state.phase === 'approved' ? 'done' : 'upcoming'}
            />
          </div>
        </section>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
          <ReviewQueue
            phase={state.phase}
            revisionNo={state.revisionNo}
            warningCount={state.warningCount}
          />

          <Card className="min-w-0 gap-0 overflow-hidden py-0">
            <CardHeader className="border-b px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">매매계약서</Badge>
                <Badge className={phase.badgeClass}>{phase.label}</Badge>
                <Badge variant="secondary">최종 책임자 · 김민지</Badge>
              </div>
              <CardTitle className="mt-1 text-lg leading-snug">
                고덕그라시움 101동 1201호 매매계약서
              </CardTitle>
              <CardDescription>
                매도 이매도 → 매수 박매수 · 15억 8,000만원 · AI 계약서 도우미 작성
              </CardDescription>
              <CardAction className="hidden items-end gap-1 text-right sm:flex sm:flex-col">
                <span className="text-xs text-muted-foreground">검토 대상</span>
                <span className="text-sm font-semibold tabular-nums">
                  리비전 #{state.revisionNo}
                </span>
              </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 px-4 py-4 sm:px-5">
              <RevisionIdentity
                revisionNo={state.revisionNo}
                contentHash={state.contentHash}
                phase={state.phase}
              />

              {state.phase === 'approved' ? (
                <Alert className="border-success/30 bg-success-soft/50 text-success">
                  <ShieldCheck />
                  <AlertTitle>이 리비전의 사람 검토가 완료되었습니다.</AlertTitle>
                  <AlertDescription className="text-success/80">
                    승인 당시의 리비전 번호와 내용 해시가 감사 로그에 함께 기록됩니다.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-warning/30 bg-warning-soft/40">
                  <AlertTriangle className="text-warning" />
                  <AlertTitle>서명 전에 확인할 주의사항 {state.warningCount}건</AlertTitle>
                  <AlertDescription>
                    <span>등기부등본 기준 권리관계를 다시 확인하세요.</span>
                    {state.warningCount > 1 ? (
                      <span>매도인 신원정보 원본은 서명 전에 대조하세요.</span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="document">
                <TabsList variant="line">
                  <TabsTrigger value="document">
                    <FileText />
                    계약서
                  </TabsTrigger>
                  <TabsTrigger value="changes">
                    <GitCommitHorizontal />
                    변경점
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="document" className="mt-2">
                  <div className="overflow-x-auto rounded-lg bg-muted/50 p-2 sm:p-3">
                    <div className="min-w-[640px]">
                      <ContractDocumentPreview proposedChanges={contractChanges} />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="changes" className="mt-2">
                  <RevisionChanges
                    revisionNo={state.revisionNo}
                    lastInstruction={state.lastInstruction}
                    balanceDate={state.balanceDate}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>

            <CardFooter className="flex-col items-stretch gap-3 border-t bg-background px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  승인 대상: 리비전 #{state.revisionNo}
                </p>
                <p className="truncate font-mono" title={state.contentHash}>
                  {shortHash(state.contentHash)}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={state.phase !== 'awaiting_review'}
                    className="sm:min-w-44"
                  >
                    <ShieldCheck data-icon="inline-start" />
                    {state.phase === 'approved'
                      ? '승인 완료'
                      : state.phase === 'agent_working'
                        ? '새 리비전 생성 중'
                        : `리비전 #${state.revisionNo} 승인`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      리비전 #{state.revisionNo}을 최종 승인할까요?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      이 결정은 현재 화면의 내용 해시 {shortHash(state.contentHash)}에만
                      적용됩니다. 이후 AI가 내용을 바꾸면 새 리비전으로 다시 검토해야
                      합니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>계속 검토</AlertDialogCancel>
                    <AlertDialogAction onClick={approveRevision}>
                      이 리비전 승인
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>

          <aside className="flex min-w-0 flex-col gap-4">
            <ResponsibilityCard phase={state.phase} />
            <RevisionRequestCard
              phase={state.phase}
              revisionNo={state.revisionNo}
              instruction={state.instruction}
              onInstructionChange={(value) =>
                dispatch({ type: 'instruction_changed', value })
              }
              onSubmit={requestRevision}
            />
            <ActivityCard activity={state.activity} phase={state.phase} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function FlowStep({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'active' | 'upcoming';
}) {
  const stateLabel =
    state === 'done' ? '완료' : state === 'active' ? '현재 단계' : '예정';

  return (
    <div
      aria-current={state === 'active' ? 'step' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5',
        state === 'active' && 'border-info/40 bg-info-soft/40',
        state === 'upcoming' && 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          state === 'done' && 'border-success bg-success text-white',
          state === 'active' && 'border-info bg-info text-white',
        )}
      >
        {state === 'done' ? (
          <Check className="size-3" />
        ) : state === 'active' ? (
          <Sparkles className="size-3" />
        ) : (
          <Circle className="size-2.5" />
        )}
      </span>
      <span className="font-medium">
        {label}
        <span className="sr-only"> · {stateLabel}</span>
      </span>
    </div>
  );
}

function ReviewQueue({
  phase,
  revisionNo,
  warningCount,
}: {
  phase: HitlPhase;
  revisionNo: number;
  warningCount: number;
}) {
  const meta = PHASE_META[phase];

  return (
    <Card className="h-fit gap-0 overflow-hidden py-0 xl:sticky xl:top-[72px]">
      <CardHeader className="border-b px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquareText className="size-4" />
          AI 검토함
        </CardTitle>
        <CardDescription>사람의 판단이 필요한 결과만 모읍니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-2">
        <button
          type="button"
          aria-current="true"
          className="rounded-lg border border-info/40 bg-info-soft/30 p-3 text-left shadow-xs outline-none transition-colors hover:bg-info-soft/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between gap-2">
            <Badge className={meta.badgeClass}>{meta.label}</Badge>
            <span className="text-[11px] text-muted-foreground">12분 전</span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5">
            고덕그라시움 101동 1201호 매매계약서
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            리비전 #{revisionNo} · 주의 {phase === 'approved' ? 0 : warningCount}건
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserRoundCheck className="size-3" />
            최종 책임자 김민지
          </div>
        </button>

        {SECONDARY_QUEUE_ITEMS.map((item) => (
          <div key={item.title} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge className={item.statusClass}>{item.status}</Badge>
              <span className="text-[11px] text-muted-foreground">{item.time}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-5">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
          </div>
        ))}
      </CardContent>
      <CardFooter className="border-t px-4 py-3 text-xs text-muted-foreground">
        검토 필요 1 · AI 작업 중 1 · 완료 1
      </CardFooter>
    </Card>
  );
}

function RevisionIdentity({
  revisionNo,
  contentHash,
  phase,
}: {
  revisionNo: number;
  contentHash: string;
  phase: HitlPhase;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/25 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <div className="flex size-9 items-center justify-center rounded-lg bg-background shadow-xs ring-1 ring-border">
        <LockKeyhole className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">불변 계약서 리비전 #{revisionNo}</span>
          <Badge variant="outline">덮어쓰기 금지</Badge>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Hash className="size-3 shrink-0" />
          <code className="truncate" title={contentHash}>
            {contentHash}
          </code>
        </div>
      </div>
      <div className="text-xs text-muted-foreground sm:text-right">
        <p className="font-medium text-success">검증 오류 0건</p>
        <p>{phase === 'approved' ? '사람 승인 완료' : '서명 전 주의사항 확인'}</p>
      </div>
    </div>
  );
}

function RevisionChanges({
  revisionNo,
  lastInstruction,
  balanceDate,
}: {
  revisionNo: number;
  lastInstruction: string | null;
  balanceDate: string;
}) {
  const balanceLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(balanceDate));

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">리비전 #{revisionNo} 변경 요약</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            AI가 생성한 설명이며, 승인 대상은 오른쪽 내용 해시로 고정됩니다.
          </p>
        </div>
        <Badge variant="outline">현재 버전</Badge>
      </div>
      <Separator />
      {lastInstruction ? (
        <div className="rounded-md bg-info-soft/50 p-3 text-sm">
          <p className="text-xs font-medium text-info">사람의 수정 지시</p>
          <p className="mt-1 leading-6">{lastInstruction}</p>
        </div>
      ) : null}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">잔금 및 인도일</p>
          <p className="mt-1 font-medium">{balanceLabel}</p>
        </div>
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">검증 결과</p>
          <p className="mt-1 font-medium">필수값 오류 없음</p>
        </div>
        <div className="rounded-md bg-muted p-3 sm:col-span-2">
          <p className="text-xs text-muted-foreground">특약 제3항</p>
          <p className="mt-1 leading-6">
            잔금일은 당사자 합의로 2026년 9월 5일까지 조정할 수 있다.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResponsibilityCard({ phase }: { phase: HitlPhase }) {
  const progress = phase === 'approved' ? 100 : phase === 'agent_working' ? 58 : 75;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4" />
          책임과 위임
        </CardTitle>
        <CardDescription>AI에게 맡겨도 최종 책임자는 바뀌지 않습니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PersonIdentity kind="human" />
          <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
            <span>초안 작성 위임</span>
            <ArrowRight className="size-4" />
          </div>
          <PersonIdentity kind="agent" phase={phase} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">현재 실행 진행도</span>
            <span className="font-medium tabular-nums">{progress}%</span>
          </div>
          <Progress
            value={progress}
            aria-label="현재 AI 계약 검토 실행 진행도"
            aria-valuetext={`${progress}% 완료`}
          />
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <PlanStep done label="거래·당사자 자료 읽기" />
          <PlanStep done={phase !== 'agent_working'} active={phase === 'agent_working'} label="계약서 작성·검증" />
          <PlanStep done={phase === 'approved'} active={phase === 'awaiting_review'} label="최종 책임자 검토" />
        </div>
      </CardContent>
    </Card>
  );
}

function PersonIdentity({
  kind,
  phase,
}: {
  kind: 'human' | 'agent';
  phase?: HitlPhase;
}) {
  const isHuman = kind === 'human';
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <Avatar size="lg">
        <AvatarFallback className={isHuman ? 'bg-info-soft text-info' : 'bg-violet-soft text-violet'}>
          {isHuman ? '김' : <Bot className="size-4" />}
        </AvatarFallback>
        <AvatarBadge
          className={cn(
            isHuman || phase === 'approved' ? 'bg-success' : 'bg-warning',
          )}
        />
      </Avatar>
      <p className="mt-2 truncate text-xs font-semibold">
        {isHuman ? '김민지' : '계약서 도우미'}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {isHuman ? '최종 책임자' : 'AI 실행자'}
      </p>
    </div>
  );
}

function PlanStep({
  done = false,
  active = false,
  label,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
}) {
  const stateLabel = done ? '완료' : active ? '현재 단계' : '예정';

  return (
    <div
      className="flex items-center gap-2"
      aria-current={active ? 'step' : undefined}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          done && 'border-success bg-success text-white',
          active && 'border-info bg-info text-white',
        )}
      >
        {done ? <Check className="size-3" /> : active ? <Sparkles className="size-3" /> : <Circle className="size-2" />}
      </span>
      <span className={cn(!done && !active && 'text-muted-foreground')}>
        {label}
        <span className="sr-only"> · {stateLabel}</span>
      </span>
    </div>
  );
}

function RevisionRequestCard({
  phase,
  revisionNo,
  instruction,
  onInstructionChange,
  onSubmit,
}: {
  phase: HitlPhase;
  revisionNo: number;
  instruction: string;
  onInstructionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const isWorking = phase === 'agent_working';
  const isApproved = phase === 'approved';

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquareText className="size-4" />
          AI 수정 지시
        </CardTitle>
        <CardDescription>
          현재 버전을 덮어쓰지 않고 새 리비전을 요청합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <Textarea
          aria-label="AI에게 전달할 계약서 수정 지시"
          value={instruction}
          disabled={isWorking || isApproved}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="예: 특약 3번을 삭제하고 잔금일을 9월 5일로 바꿔 주세요."
          className="min-h-24 resize-none"
        />
        <Button
          variant="outline"
          disabled={isWorking || isApproved}
          onClick={onSubmit}
        >
          {isWorking ? (
            <RefreshCcw data-icon="inline-start" className="animate-spin" />
          ) : (
            <Send data-icon="inline-start" />
          )}
          {isApproved
            ? '이미 승인됨'
            : isWorking
              ? `리비전 #${revisionNo + 1} 생성 중`
              : '새 리비전 요청'}
        </Button>
        <p className="text-[11px] leading-5 text-muted-foreground">
          요청하면 AI 세션이 다시 실행되고, 완료 시 새로운 번호와 해시로 사람 검토 단계에
          돌아옵니다.
        </p>
      </CardContent>
    </Card>
  );
}

function ActivityCard({
  activity,
  phase,
}: {
  activity: HitlActivity[];
  phase: HitlPhase;
}) {
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4" />
          실행 로그
        </CardTitle>
        <CardDescription>사람·AI·시스템 활동을 같은 흐름으로 남깁니다.</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ScrollArea className="h-64 pr-3">
          <div className="flex flex-col gap-0">
            {phase === 'agent_working' ? (
              <TimelineItem
                activity={{
                  id: 'working',
                  actor: 'agent',
                  title: '수정 지시 반영 중',
                  detail: '계약서 엔진을 다시 실행하고 필수 항목을 검증하고 있습니다.',
                  timeLabel: '진행 중',
                }}
                isLast={activity.length === 0}
                working
              />
            ) : null}
            {activity.map((item, index) => (
              <TimelineItem
                key={item.id}
                activity={item}
                isLast={index === activity.length - 1}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  activity,
  isLast,
  working = false,
}: {
  activity: HitlActivity;
  isLast: boolean;
  working?: boolean;
}) {
  const icon =
    activity.actor === 'human' ? (
      <UserRoundCheck className="size-3" />
    ) : activity.actor === 'agent' ? (
      <Bot className={cn('size-3', working && 'animate-pulse')} />
    ) : (
      <GitCommitHorizontal className="size-3" />
    );

  return (
    <div className="grid grid-cols-[24px_1fr] gap-2">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border bg-background',
            activity.actor === 'human' && 'border-info/40 text-info',
            activity.actor === 'agent' && 'border-violet/40 text-violet',
            activity.actor === 'system' && 'text-muted-foreground',
          )}
        >
          {icon}
        </span>
        {!isLast ? <span className="min-h-6 w-px flex-1 bg-border" /> : null}
      </div>
      <div className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium">{activity.title}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {activity.timeLabel}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {activity.detail}
        </p>
      </div>
    </div>
  );
}
