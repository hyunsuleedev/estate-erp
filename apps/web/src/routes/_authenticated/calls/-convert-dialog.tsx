import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type {
  CallRecordingAnalysis,
  CallRecordingMessage,
  CreateConsultationDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { speakerLabelOf } from './-call-utils';

/** AI 분석 + STT 대화로 상담 내용 프리필 문안 구성 */
function buildPrefillContent(
  analysis: CallRecordingAnalysis | null,
  messages: CallRecordingMessage[],
): string {
  const parts: string[] = [];

  if (analysis?.summary) parts.push(String(analysis.summary));

  const keyPoints = analysis?.['keyPoints'];
  if (Array.isArray(keyPoints) && keyPoints.length > 0) {
    parts.push(`핵심 정보:\n${keyPoints.map((k) => `- ${String(k)}`).join('\n')}`);
  }

  const nextActions = analysis?.nextActions;
  if (Array.isArray(nextActions) && nextActions.length > 0) {
    parts.push(`다음 조치:\n${nextActions.map((a) => `- ${String(a)}`).join('\n')}`);
  } else if (typeof nextActions === 'string' && nextActions.trim()) {
    parts.push(`다음 조치:\n- ${nextActions}`);
  }

  // 분석이 없으면 대화 앞부분으로 대체
  if (parts.length === 0 && messages.length > 0) {
    const lines = messages
      .slice(0, 12)
      .map((m) => `${speakerLabelOf(m.speaker, m.speakerLabel)}: ${m.text}`);
    if (messages.length > 12) lines.push('… (이하 생략)');
    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n');
}

/** 통화 기록 → 상담 기록 전환 (AI 요약/대화 프리필 + callRecordingId 연결) */
export function ConvertConsultationDialog({
  open,
  onOpenChange,
  recordingId,
  contact,
  analysis,
  messages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string;
  contact: { id: string; name: string; phone: string | null };
  analysis: CallRecordingAnalysis | null;
  messages: CallRecordingMessage[];
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('phone');
    setContent(buildPrefillContent(analysis, messages));
  }, [open, analysis, messages]);

  const mutation = useMutation({
    mutationFn: () => {
      // 서버 POST /consultations가 callRecordingId 연결을 지원한다.
      // CreateConsultationDto(api-client consultations.ts)에는 아직 필드가 없어 확장 타입으로 전달.
      const dto: CreateConsultationDto & { callRecordingId: string } = {
        contactId: contact.id,
        type,
        purpose: 'general',
        content: content.trim(),
        callRecordingId: recordingId,
      };
      return api.consultations.create(dto);
    },
    onSuccess: () => {
      toast.success('상담 기록이 생성되었습니다');
      void queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
      onOpenChange(false);
    },
    onError: () => toast.error('상담 전환에 실패했습니다'),
  });

  const canSubmit = content.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base">상담으로 전환</DialogTitle>
          <DialogDescription className="text-xs">
            통화 내용을 상담 기록으로 저장합니다. 저장 후 상담기록 페이지에서 매물·매칭에
            연결할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">고객</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{contact.name}</span>
              {contact.phone && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatPhone(contact.phone)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">상담유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">전화</SelectItem>
                <SelectItem value="visit">방문</SelectItem>
                <SelectItem value="online">온라인</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              상담 내용 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="통화에서 나눈 내용을 정리합니다."
              className="max-h-64 min-h-36 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              AI 요약과 대화 내용이 자동으로 채워집니다. 저장 전에 수정할 수 있습니다.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            상담 기록 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
