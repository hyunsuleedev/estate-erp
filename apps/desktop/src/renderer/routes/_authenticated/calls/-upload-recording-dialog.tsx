import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileAudio, Upload } from 'lucide-react';
import { parseCallRecordingFileName } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDuration } from './-call-utils';
import { useRecordingUploadStore } from './-recording-upload-store';

/** Date → datetime-local 입력값 (이 PC 시간대) */
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 오디오 길이(초). 읽지 못하면 null */
function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/**
 * 핸드폰 통화 녹음 파일 올리기 (앱 자동 업로드 전 수동 경로).
 * 갤럭시 기본 녹음 파일 이름에서 상대 번호와 통화 시각을 채운다.
 * 올리면 받아쓰기 → 분석 → 상담 기록·업무 제안이 자동으로 이어진다.
 * 올리기는 뒤에서 진행되고(-recording-upload-store) 이 창은 바로 닫힌다.
 */
export function UploadRecordingDialog({
  open,
  onOpenChange,
  attachTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 이미 적어 둔 상담에 녹음을 붙일 때. 종류·번호는 그 상담에서 정해지므로 묻지 않고,
   * 상담 내용은 그대로 둔 채 받아쓰기와 분석만 더한다.
   */
  attachTo?: { id: string; type: string; contactName: string; createdAt: string } | null;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phone, setPhone] = useState('');
  const [calledAt, setCalledAt] = useState('');
  // 전화 녹음 또는 사무소에서 나눈 방문 상담 녹음 (방문이면 방문 상담으로 남는다)
  const [kind, setKind] = useState<'phone' | 'visit'>('phone');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [durationSec, setDurationSec] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPhone('');
    setCalledAt('');
    setKind(attachTo?.type === 'visit' ? 'visit' : 'phone');
    setDirection('inbound');
    setDurationSec(null);
  }, [open, attachTo?.type]);

  const pickFile = (next: File | null) => {
    setFile(next);
    setDurationSec(null);
    if (!next) return;
    const parsed = parseCallRecordingFileName(next.name);
    setPhone(parsed.phoneNumber ? formatPhone(parsed.phoneNumber) : '');
    // 붙이는 경우에는 상담 기록의 시각이 기준이다 (파일을 옮긴 시각으로 바뀌지 않게)
    setCalledAt(
      toLocalInputValue(attachTo ? new Date(attachTo.createdAt) : (parsed.calledAt ?? new Date(next.lastModified))),
    );
    void readAudioDuration(next).then(setDurationSec);
  };

  const startUpload = useRecordingUploadStore((state) => state.start);

  // 올리기를 시작하고 창은 바로 닫는다. 진행 상황은 상담분석 표의 "올리는 중" 줄에서 본다.
  const submit = () => {
    if (!file) return;
    startUpload(
      {
        file,
        kind,
        direction,
        phoneNumber: phone.replace(/\D/g, ''),
        calledAt: (calledAt ? new Date(calledAt) : new Date()).toISOString(),
        durationSec,
        attachTo: attachTo ? { id: attachTo.id, contactName: attachTo.contactName } : null,
      },
      queryClient,
    );
    toast.success(
      attachTo
        ? '녹음을 올리는 중입니다. 다 올라가면 받아쓰기와 분석이 이어집니다.'
        : '녹음을 올리는 중입니다. 표에서 진행 상황을 볼 수 있습니다.',
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base">{attachTo ? '이 상담에 녹음 붙이기' : '녹음 올리기'}</DialogTitle>
          <DialogDescription className="text-xs">
            {attachTo
              ? `${attachTo.contactName} 님과의 상담에 녹음을 붙입니다. 적어 둔 내용은 그대로 두고 받아쓰기·요약·업무 제안을 더합니다.`
              : '받아쓰기와 분석이 끝나면 상담 기록이 남고, 업무·일정을 제안합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div
            role="radiogroup"
            aria-label="녹음 종류"
            className={cn('grid grid-cols-2 gap-1 rounded-md bg-muted p-1', attachTo && 'hidden')}
          >
            {(
              [
                { value: 'phone', label: '전화 통화' },
                { value: 'visit', label: '방문 상담' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={kind === option.value}
                onClick={() => setKind(option.value)}
                className={cn(
                  'rounded px-2 py-1.5 text-[13px] transition-colors',
                  kind === option.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.m4a"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-md border border-dashed px-3 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <FileAudio className="size-5 shrink-0 text-muted-foreground" />
            {file ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{file.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {Math.round(file.size / 1024).toLocaleString()}KB
                  {durationSec !== null && ` · ${formatDuration(durationSec)}`}
                </span>
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">녹음 파일 고르기 (m4a, mp3, wav 등)</span>
            )}
          </button>

          <div className={cn('grid gap-3', kind === 'phone' && !attachTo && 'grid-cols-2', attachTo && kind === 'visit' && 'hidden')}>
            <div className={cn('space-y-1.5', attachTo && 'hidden')}>
              <Label className="text-xs font-semibold">{kind === 'visit' ? '고객 번호 (선택)' : '상대 번호'}</Label>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-0000-0000"
                className="h-9 text-[13px]"
              />
            </div>
            {kind === 'phone' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">방향</Label>
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as 'inbound' | 'outbound')}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                >
                  <option value="inbound">수신</option>
                  <option value="outbound">발신</option>
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{kind === 'visit' ? '상담 시각' : '통화 시각'}</Label>
            <Input
              type="datetime-local"
              value={calledAt}
              onChange={(event) => setCalledAt(event.target.value)}
              className="h-9 text-[13px]"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {attachTo
              ? '한 상담에는 녹음 하나만 붙일 수 있습니다.'
              : kind === 'visit'
              ? '고객 번호를 넣으면 그 연락처의 방문 상담으로 남습니다. 비워 두면 연결 대기에서 연락처를 이어 주세요.'
              : '등록된 번호면 그 연락처에 자동으로 연결됩니다. 갤럭시 기본 녹음 파일은 번호와 시각을 파일 이름에서 채웁니다.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button size="sm" disabled={!file} onClick={submit}>
            <Upload className="size-3.5" />
            {attachTo ? '붙이기' : '올리기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
