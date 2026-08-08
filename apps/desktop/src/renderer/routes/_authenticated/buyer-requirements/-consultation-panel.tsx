import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Globe,
  MessageSquare,
  Phone,
  Plus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  BuyerRequirement,
  BuyerRequirementConsultation,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CONSULTATION_TYPE_LABELS } from './-buyer-utils';

/** 상담 유형별 타임라인 아이콘 (라벨은 CONSULTATION_TYPE_LABELS와 쌍) */
const CONSULTATION_TYPE_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  visit: Users,
  online: Globe,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:30" — 날짜 그룹 안에서는 시각만 표시한다 */
function formatTime(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 날짜 그룹 헤더 라벨 — 오늘/어제는 상대 표기, 그 외 "2026.08.05" */
function formatDayLabel(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  return formatDate(date);
}

interface ConsultationGroup {
  key: string;
  label: string;
  items: BuyerRequirementConsultation[];
}

/** 최신순 정렬 후 로컬 날짜(yyyy-MM-dd) 단위로 묶는다 */
function groupByDay(
  consultations: BuyerRequirementConsultation[],
): ConsultationGroup[] {
  const sorted = [...consultations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const groups: ConsultationGroup[] = [];
  const index = new Map<string, ConsultationGroup>();
  for (const c of sorted) {
    const date = new Date(c.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    let group = index.get(key);
    if (!group) {
      group = { key, label: formatDayLabel(c.createdAt), items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(c);
  }
  return groups;
}

export function ConsultationPanel({ requirement }: { requirement: BuyerRequirement }) {
  const queryClient = useQueryClient();
  const consultationGroups = useMemo(
    () => groupByDay(requirement.consultations ?? []),
    [requirement.consultations],
  );
  const consultationCount = requirement.consultations?.length ?? 0;

  // ── 상담 추가 ──────────────────────────────────────────────
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultType, setConsultType] = useState('phone');
  const [consultContent, setConsultContent] = useState('');
  const [touchLastContact, setTouchLastContact] = useState(true);

  const createConsultation = useMutation({
    mutationFn: async () => {
      await api.consultations.create({
        contactId: requirement.contactId,
        type: consultType,
        content: consultContent.trim(),
        buyerReqId: requirement.id,
      });
      if (touchLastContact) {
        await api.buyerRequirements.update(requirement.id, {
          lastContactDate: new Date().toISOString(),
        });
      }
    },
    onSuccess: async () => {
      toast.success('상담 기록이 추가되었습니다.');
      setConsultOpen(false);
      setConsultContent('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      ]);
    },
    onError: () => {
      toast.error('상담 기록 추가에 실패했습니다.');
    },
  });

  // ── 후속 태스크 추가 ──────────────────────────────────────
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskContent, setTaskContent] = useState('');

  const createTask = useMutation({
    mutationFn: () =>
      api.tasks.create({
        title: taskTitle.trim(),
        content: taskContent.trim() || undefined,
        dueDate: taskDueDate || undefined,
        contactId: requirement.contactId,
        buyerReqId: requirement.id,
      }),
    onSuccess: async () => {
      toast.success('후속 태스크가 생성되었습니다.');
      setTaskOpen(false);
      setTaskTitle('');
      setTaskDueDate('');
      setTaskContent('');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('태스크 생성에 실패했습니다.');
    },
  });

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          상담내역{' '}
          <span className="font-normal text-muted-foreground">
            최근 {consultationCount}건
          </span>
        </h3>
      </div>

      {/* 독립 스크롤 영역 — 여러 줄 내용을 그대로 읽을 수 있어야 함 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {consultationGroups.length === 0 ? (
          <div className="px-4 py-4">
            <EmptyState
              icon={MessageSquare}
              title="상담 기록이 없습니다"
              description="전화·방문·온라인 상담을 기록하면 날짜별 타임라인으로 쌓입니다. 아래 '상담 추가' 버튼으로 첫 상담을 남겨보세요."
            />
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            {consultationGroups.map((group) => (
              <section key={group.key}>
                {/* 날짜 그룹 헤더 — 스크롤해도 현재 날짜가 보이도록 sticky */}
                <div className="sticky top-0 z-10 flex items-baseline gap-1.5 bg-card py-1">
                  <span className="text-xs font-semibold">{group.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length}건
                  </span>
                </div>
                <ul className="mt-1 ml-2 space-y-4 border-l border-border pl-4">
                  {group.items.map((c) => {
                    const TypeIcon =
                      CONSULTATION_TYPE_ICONS[c.type] ?? MessageSquare;
                    return (
                      <li key={c.id} className="relative">
                        {/* 타임라인 노드 — 상담 유형 아이콘 */}
                        <span className="absolute top-0.5 -left-[26px] flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground">
                          <TypeIcon className="size-3" aria-hidden="true" />
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/70">
                            {CONSULTATION_TYPE_LABELS[c.type] ?? c.type}
                          </span>
                          <span className="tabular-nums">
                            {formatTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                          {c.content}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* 하단 고정 액션 — 스크롤 위치와 무관하게 상담 추가 가능 */}
      <div className="flex gap-2 border-t p-3">
        <Button
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => setConsultOpen(true)}
        >
          <Plus className="size-3.5" />
          상담 추가
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => setTaskOpen(true)}
        >
          <ClipboardList className="size-3.5" />
          후속 태스크
        </Button>
      </div>

      {/* ── 상담 추가 Dialog ── */}
      <Dialog open={consultOpen} onOpenChange={setConsultOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>상담 기록 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">상담 유형</Label>
              <Select value={consultType} onValueChange={setConsultType}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONSULTATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                내용 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={consultContent}
                onChange={(e) => setConsultContent(e.target.value)}
                placeholder="상담 내용을 입력하세요"
                className="min-h-28 text-sm"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={touchLastContact}
                onCheckedChange={(v) => setTouchLastContact(v === true)}
              />
              최근 연락일을 오늘로 갱신
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConsultOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={createConsultation.isPending || !consultContent.trim()}
              onClick={() => createConsultation.mutate()}
            >
              {createConsultation.isPending ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 후속 태스크 Dialog ── */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>후속 태스크 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                제목 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="예: 고객에게 후보 매물 자료 발송"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">마감일</Label>
              <Input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">내용</Label>
              <Textarea
                value={taskContent}
                onChange={(e) => setTaskContent(e.target.value)}
                placeholder="세부 내용 (선택)"
                className="min-h-20 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTaskOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={createTask.isPending || !taskTitle.trim()}
              onClick={() => createTask.mutate()}
            >
              {createTask.isPending ? '생성 중…' : '태스크 생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
