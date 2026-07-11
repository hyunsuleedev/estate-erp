import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { BuyerRequirement } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
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

export function ConsultationPanel({ requirement }: { requirement: BuyerRequirement }) {
  const queryClient = useQueryClient();
  const consultations = requirement.consultations ?? [];

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
    <aside className="flex h-full flex-col rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          상담내역{' '}
          <span className="font-normal text-muted-foreground">
            최근 {consultations.length}건
          </span>
        </h3>
      </div>

      {/* 독립 스크롤 영역 — 여러 줄 내용을 그대로 읽을 수 있어야 함 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {consultations.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={MessageSquare}
              title="상담 기록이 없습니다"
              description="첫 상담을 기록해보세요."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {consultations.map((c) => (
              <li key={c.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/70">
                    {CONSULTATION_TYPE_LABELS[c.type] ?? c.type}
                  </span>
                  <span className="tabular-nums">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 border-t p-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => setConsultOpen(true)}
        >
          <MessageSquare className="size-3.5" />
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
