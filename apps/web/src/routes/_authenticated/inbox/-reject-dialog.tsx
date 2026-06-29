import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * 거부 사유 입력 다이얼로그 — draft / proposal 공용.
 * 확정 시 onConfirm(note) 호출 후 즉시 닫힌다 (commit 은 caller 의 undo 흐름에서 처리).
 */
export function RejectNoteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>거부 사유</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-note" className="text-xs">
            거부 이유를 남겨주세요 (감사 기록)
          </Label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 이미 다른 경로로 처리함"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            disabled={!note.trim()}
            onClick={() => {
              if (!note.trim()) return;
              onConfirm(note.trim());
              setNote('');
              onOpenChange(false);
            }}
          >
            거부 확정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
