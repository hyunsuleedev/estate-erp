import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { apiErrorMessage } from '@/lib/api-error';
import { formatRelativeDay } from '@/lib/format';
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
import { RailSection } from '../properties/-detail/rail';
import { nb } from '../properties/-detail/ui';
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

/** 날짜 그룹 헤더 라벨 — 앱 공용 표기("오늘 · 어제 · 11.19 (목)") */
function formatDayLabel(d: string): string {
  return formatRelativeDay(d);
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
  const participants = useMemo(
    () => (requirement.buyerIntake?.contacts ?? []).filter((p) => p.contact),
    [requirement.buyerIntake?.contacts],
  );
  const participantNameById = useMemo(
    () => new Map(participants.map((p) => [p.contactId, p.contact?.name ?? ''])),
    [participants],
  );
  const defaultContactId =
    participants.find((p) => p.isPrimary)?.contactId ??
    participants[0]?.contactId ??
    requirement.contactId;

  const consultationGroups = useMemo(
    () => groupByDay(requirement.consultations ?? []),
    [requirement.consultations],
  );
  const consultationCount = requirement.consultations?.length ?? 0;

  // ── 상담 추가 ──────────────────────────────────────────────
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContactId, setConsultContactId] = useState(defaultContactId);
  const [consultType, setConsultType] = useState('phone');
  const [consultContent, setConsultContent] = useState('');
  const [touchLastContact, setTouchLastContact] = useState(true);

  useEffect(() => {
    if (consultOpen) {
      setConsultContactId(defaultContactId);
    }
  }, [consultOpen, defaultContactId]);

  const createConsultation = useMutation({
    mutationFn: async () => {
      await api.consultations.create({
        contactId: consultContactId || requirement.contactId,
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
      toast.success('상담을 적었습니다.');
      setConsultOpen(false);
      setConsultContent('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      ]);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '상담을 저장하지 못했습니다. 다시 시도해 주세요.'));
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
      toast.success('업무를 추가했습니다.');
      setTaskOpen(false);
      setTaskTitle('');
      setTaskDueDate('');
      setTaskContent('');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '업무를 만들지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  // 오른쪽 열의 한 구역(매물 상세 · 프로젝트 상세의 RailSection과 같은 모양): 제목 줄 + 날짜별 상담 + 아래 단추
  return (
    <RailSection
      title="상담"
      count={consultationCount}
      action={
        <button type="button" className={nb.ghost} onClick={() => setConsultOpen(true)}>
          <Plus />
          상담 적기
        </button>
      }
    >
      <div data-requirement-consultations>
        {consultationGroups.length === 0 ? (
          <p className="py-1 break-keep text-[13px] leading-5 text-[#37352f]/65">
            이 조건으로 남긴 상담이 없습니다. 전화 · 방문 뒤 &lsquo;상담 적기&rsquo;로 남기면 날짜별로 쌓입니다.
          </p>
        ) : (
          <ol>
            {consultationGroups.map((group) => (
              <li key={group.key} className="py-1.5 [&+&]:border-t [&+&]:border-[#37352f]/[0.06]">
                <div className="flex items-baseline gap-1.5 text-[12.5px] leading-[18px] text-[#37352f]/65">
                  <span className="font-medium text-[#37352f]">{group.label}</span>
                  <span>{group.items.length}건</span>
                </div>
                <ul>
                  {group.items.map((c) => {
                    const TypeIcon = CONSULTATION_TYPE_ICONS[c.type] ?? MessageSquare;
                    const participantName =
                      participants.length > 1 ? participantNameById.get(c.contactId) : undefined;
                    return (
                      <li key={c.id} className="py-1">
                        <div className="flex items-center gap-1.5 text-[12.5px] leading-[18px] text-[#37352f]/65">
                          <TypeIcon className="size-3" aria-hidden="true" />
                          <span>{CONSULTATION_TYPE_LABELS[c.type] ?? c.type}</span>
                          {participantName && (
                            <span className="truncate font-medium text-[#37352f]/80">
                              {participantName}
                            </span>
                          )}
                          <span className="tabular-nums">{formatTime(c.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-keep text-[13.5px] leading-5 text-[#37352f]/90 [overflow-wrap:anywhere]">
                          {c.content}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <button type="button" className={nb.ghost} onClick={() => setTaskOpen(true)}>
            <ClipboardList />
            다음 업무
          </button>
          {/* 여기에는 이 조건에 걸린 상담만 보인다. 연락처에서 적은 이 손님의 다른 상담은 연락처 상세에 있다 */}
          {requirement.contact?.id && (
            <Link
              to="/contacts/$id"
              params={{ id: requirement.contact.id }}
              className={nb.ghost}
              data-requirement-contact-consultations
            >
              <MessageSquare />
              이 손님의 모든 상담
            </Link>
          )}
        </div>
      </div>

      {/* ── 상담 추가 Dialog ── */}
      <Dialog open={consultOpen} onOpenChange={setConsultOpen}>
        <DialogContent
          className="sm:max-w-md"
          // 적다가 창 밖을 잘못 눌러도 적은 내용이 말없이 사라지지 않게 한다 (닫기는 취소 · Esc)
          onInteractOutside={(event) => {
            if (consultContent.trim()) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>상담 적기</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {participants.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">상담 대상</Label>
                <Select value={consultContactId} onValueChange={setConsultContactId}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.contactId} value={p.contactId}>
                        <span>{p.contact?.name ?? ''}</span>
                        {p.isPrimary && (
                          <span className="ml-1 text-xs text-muted-foreground">(대표)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

      {/* ── 다음 업무 Dialog ── */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>다음 업무</DialogTitle>
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
              {createTask.isPending ? '추가하는 중…' : '업무 추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RailSection>
  );
}
