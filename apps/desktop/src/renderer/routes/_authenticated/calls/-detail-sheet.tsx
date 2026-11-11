import { useState } from 'react';
import {
  Clock,
  Link2,
  MessageSquarePlus,
  PhoneIncoming,
  PhoneOutgoing,
  User as UserIcon,
  UserPlus,
  Users,
} from 'lucide-react';
import type { CallRecordingListItem } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDateTime, formatPhone } from '@/lib/format';
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EntityChip } from '@/components/domain';
import { directionLabel, formatDuration, sttStatusClass, sttStatusLabel } from './-call-utils';
import { LinkContactDialog, RegisterContactDialog } from './-contact-dialogs';
import { ConvertConsultationDialog } from './-convert-dialog';
import { CallAnalysisPanel, useCallRecordingDetail } from './-call-analysis-panel';

/** 통화 상세: 머리글(시스템 값) · 연락처 연결 · 상담 전환 + 통화 분석 본문 */
export function CallDetailSheet({ item }: { item: CallRecordingListItem }) {
  const isInbound = item.direction === 'inbound';
  const isVisit = item.direction === 'visit';

  const [registerOpen, setRegisterOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  // 본문(CallAnalysisPanel)과 같은 조회를 공유한다
  const detail = useCallRecordingDetail(item.id, item).data ?? null;
  const sttStatus = detail?.sttStatus ?? item.sttStatus;
  const messages = detail?.messages ?? item.messages;
  const analysis = detail?.analysis ?? item.analysis;
  const contact = detail?.contact ?? item.contact;
  const contactName = contact?.name ?? '미등록 번호';

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-1.5 border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex size-7 items-center justify-center rounded-full',
              isVisit
                ? 'bg-success-soft text-success'
                : isInbound
                  ? 'bg-info-soft text-info'
                  : 'bg-violet-soft text-violet',
            )}
          >
            {isVisit ? (
              <Users className="size-3.5" />
            ) : isInbound ? (
              <PhoneIncoming className="size-3.5" />
            ) : (
              <PhoneOutgoing className="size-3.5" />
            )}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {directionLabel(item.direction)}
          </Badge>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              sttStatusClass[sttStatus],
            )}
          >
            {sttStatusLabel[sttStatus]}
          </span>
        </div>
        <SheetTitle className="text-lg">
          <span className={cn(!contact && 'italic text-muted-foreground')}>
            {contactName}
          </span>
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {item.phoneNumber ? formatPhone(item.phoneNumber) : '번호 없음'}
          </span>
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDateTime(item.calledAt)}</span>
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock className="size-3" />
            {formatDuration(item.durationSec)}
          </span>
          {item.user && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="size-3" />
              {item.user.name}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      {/* 액션 바 — 연락처 연결 / 상담 전환 */}
      <div className="border-b bg-muted/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {contact ? (
            <EntityChip
              kind="contact"
              id={contact.id}
              label={contact.name}
              sublabel={formatPhone(contact.phone ?? item.phoneNumber)}
            />
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>
                <UserPlus className="size-3.5" />
                연락처로 등록
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2 className="size-3.5" />
                기존 연락처 연결
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!contact}
            onClick={() => setConvertOpen(true)}
          >
            <MessageSquarePlus className="size-3.5" />
            상담으로 전환
          </Button>
        </div>
        {!contact && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            연락처를 등록하거나 연결하면 상담으로 전환할 수 있습니다.
          </p>
        )}
      </div>

      <CallAnalysisPanel recordingId={item.id} initial={item} />

      {/* 다이얼로그 */}
      <RegisterContactDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        recordingId={item.id}
        phoneNumber={item.phoneNumber}
      />
      <LinkContactDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        recordingId={item.id}
      />
      {contact && (
        <ConvertConsultationDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          recordingId={item.id}
          contact={contact}
          analysis={analysis}
          messages={messages}
        />
      )}
    </div>
  );
}
