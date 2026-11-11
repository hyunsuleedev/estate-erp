/**
 * seed-demo-calls.ts — 상담분석 화면에서 통화 분석을 보여 줄 데모 녹음 3건.
 *
 *   1. 방문 상담 (부부, 4분, 45줄) — 녹음 재생·근거 칩·확인할 점·숫자·제안 3건
 *   2. 집주인 가격 조정 전화 (발신) — 말한 값 정정(15억 5천 → 15억 2천), 제안 2건
 *   3. 미등록 번호 전세 문의 (수신) — 연락처가 없어 상담분석 위 '연결 대기'에 보인다
 *
 * 분석 결과는 실제 파이프라인과 같은 parseCallAnalysis로 검증해 저장한다(근거 줄 번호, 제안 내용 형식).
 * 대상: SEED_OFFICE_ID가 있으면 그 사무소, 없으면 첫 활성 사무소.
 * 재실행: fileName이 '[DEMO-CALL]'로 시작하는 녹음과 그 상담 기록·제안을 지우고 다시 만든다.
 *         데모 연락처(전화번호로 찾음)는 지우지 않고 다시 쓴다.
 *
 * 녹음 재생: apps/desktop/public/demo-audio/<audio> 파일이 있으면 fileUrl을 /demo-audio/<audio>로 둔다.
 *           (개발 렌더러가 public 폴더를 제공한다. 이 폴더는 git에서 제외한다)
 *
 * 실행 (저장소 루트):
 *   set -a; source apps/server/.env; set +a; pnpm tsx prisma/seed-demo-calls.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  buildConsultationContent,
  parseCallAnalysis,
} from '../apps/server/src/modules/call-intelligence/analysis/call-analysis.parser';

const DEMO_PREFIX = '[DEMO-CALL]';
const here = __dirname;
const AUDIO_DIR = path.join(here, '../apps/desktop/public/demo-audio');

interface DemoMessage {
  seq: number;
  speaker: number;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
}

interface DemoScenario {
  key: string;
  fileName: string;
  audio: string | null;
  direction: 'inbound' | 'outbound' | 'visit';
  calledAt: string;
  contact: { name: string; phone: string } | null;
  phoneNumber?: string;
  purpose: string;
  messages: DemoMessage[];
  analysis: Record<string, unknown>;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const office = process.env.SEED_OFFICE_ID
      ? await prisma.office.findUnique({ where: { id: process.env.SEED_OFFICE_ID } })
      : await prisma.office.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!office) throw new Error('대상 사무소가 없습니다 (SEED_OFFICE_ID 또는 활성 사무소 필요)');
    const owner =
      (await prisma.user.findFirst({ where: { officeId: office.id, role: 'owner', isActive: true } })) ??
      (await prisma.user.findFirst({ where: { officeId: office.id, isActive: true } }));
    if (!owner) throw new Error('사무소에 사용자가 없습니다');
    console.log(`대상 사무소: ${office.name} · 기록자: ${owner.name}`);

    const { scenarios } = JSON.parse(
      readFileSync(path.join(here, 'data/demo-calls/demo-calls.json'), 'utf8'),
    ) as { scenarios: DemoScenario[] };

    await removePreviousDemo(prisma, office.id);

    for (const scenario of scenarios) {
      await createScenario(prisma, office.id, owner.id, scenario);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** 지난 데모 녹음과 그 상담 기록을 지운다 (제안·받아쓰기는 녹음과 함께 지워진다) */
async function removePreviousDemo(prisma: PrismaClient, officeId: string) {
  const recordings = await prisma.callRecording.findMany({
    where: { officeId, fileName: { startsWith: DEMO_PREFIX } },
    select: { id: true },
  });
  if (recordings.length === 0) return;
  const recordingIds = recordings.map((recording) => recording.id);
  const consultations = await prisma.consultation.findMany({
    where: { officeId, callRecordingId: { in: recordingIds } },
    select: { id: true },
  });
  const consultationIds = consultations.map((consultation) => consultation.id);
  await prisma.$transaction([
    // 데모 제안을 반영해 만든 할 일은 남기되 지울 상담과의 연결만 끊는다
    prisma.task.updateMany({ where: { consultationId: { in: consultationIds } }, data: { consultationId: null } }),
    prisma.callLog.updateMany({ where: { consultationId: { in: consultationIds } }, data: { consultationId: null } }),
    prisma.callLog.updateMany({ where: { recordingId: { in: recordingIds } }, data: { recordingId: null } }),
    prisma.callActionSuggestion.deleteMany({ where: { recordingId: { in: recordingIds } } }),
    prisma.consultation.deleteMany({ where: { id: { in: consultationIds } } }),
    prisma.callRecording.deleteMany({ where: { id: { in: recordingIds } } }),
  ]);
  console.log(`지난 데모 녹음 ${recordingIds.length}건, 상담 ${consultationIds.length}건을 지웠습니다`);
}

/** 데모 연락처: 같은 번호가 있으면 그 연락처를 쓰고, 없으면 만든다 */
async function demoContact(prisma: PrismaClient, officeId: string, contact: { name: string; phone: string }) {
  const phone = await prisma.contactPhone.findUnique({
    where: { officeId_phone: { officeId, phone: contact.phone } },
    select: { contactId: true },
  });
  if (phone) return prisma.contact.findUniqueOrThrow({ where: { id: phone.contactId } });
  return prisma.contact.create({
    data: {
      officeId,
      name: contact.name,
      memo: `${DEMO_PREFIX} 통화 분석 데모 연락처`,
      phones: { create: { officeId, phone: contact.phone, label: 'mobile', isPrimary: true } },
    },
  });
}

async function createScenario(prisma: PrismaClient, officeId: string, userId: string, scenario: DemoScenario) {
  const contact = scenario.contact ? await demoContact(prisma, officeId, scenario.contact) : null;
  const phoneNumber = scenario.contact?.phone ?? scenario.phoneNumber ?? '';
  const calledAt = new Date(scenario.calledAt);

  // 실제 분석과 같은 검증: 근거 줄은 받아쓰기에 있는 번호만, 제안 내용은 형식에 맞게
  const parsed = parseCallAnalysis(
    scenario.analysis,
    { contactId: contact?.id ?? null, contactName: contact?.name ?? null, refs: new Map(), openMatchKeys: new Set(), text: '' },
    [...new Set(scenario.messages.map((message) => message.speaker))],
    scenario.messages.map((message) => message.seq),
  );
  if (parsed.dropped.length > 0) {
    throw new Error(`${scenario.key}: 버려진 제안 ${JSON.stringify(parsed.dropped)}`);
  }
  const consultationContent = buildConsultationContent(parsed);
  const audioPath = scenario.audio ? path.join(AUDIO_DIR, scenario.audio) : null;
  const fileUrl = audioPath && existsSync(audioPath) ? `/demo-audio/${scenario.audio}` : null;
  const durationSec = Math.ceil(Math.max(...scenario.messages.map((message) => message.endMs)) / 1000);

  await prisma.$transaction(async (tx) => {
    const recording = await tx.callRecording.create({
      data: {
        officeId,
        userId,
        contactId: contact?.id ?? null,
        direction: scenario.direction,
        phoneNumber,
        durationSec,
        fileName: scenario.fileName,
        fileUrl,
        sttStatus: 'completed',
        sttProvider: 'demo',
        analysisStatus: 'completed',
        analyzedAt: calledAt,
        calledAt,
        analysis: {
          summary: parsed.summary,
          keyPoints: parsed.keyPoints,
          points: parsed.points,
          facts: parsed.facts,
          checks: parsed.checks,
          customerNeed: parsed.customerNeed,
          callType: parsed.callType,
          sentiment: parsed.sentiment,
          agentSpeaker: parsed.agentSpeaker,
          nextActions: parsed.suggestions.map((suggestion) => suggestion.title),
          consultationContent: contact ? consultationContent : null,
          model: 'demo',
        } as Prisma.InputJsonValue,
        messages: {
          create: scenario.messages.map((message) => ({
            seq: message.seq,
            speaker: message.speaker,
            speakerLabel: message.speakerLabel,
            text: message.text,
            startMs: message.startMs,
            endMs: message.endMs,
          })),
        },
      },
    });

    // 연락처가 있으면 분석이 남기는 것과 같은 상담 기록을 만든다 (방문 녹음은 방문 상담)
    const consultation = contact
      ? await tx.consultation.create({
          data: {
            officeId,
            contactId: contact.id,
            createdById: userId,
            type: scenario.direction === 'visit' ? 'visit' : 'phone',
            purpose: scenario.purpose,
            content: consultationContent,
            callRecordingId: recording.id,
            createdAt: calledAt,
          },
        })
      : null;
    if (consultation) {
      await tx.callRecording.update({ where: { id: recording.id }, data: { autoConsultationId: consultation.id } });
    }

    await tx.callActionSuggestion.createMany({
      data: parsed.suggestions.map((suggestion, index) => ({
        officeId,
        recordingId: recording.id,
        consultationId: consultation?.id ?? null,
        contactId: contact?.id ?? null,
        type: suggestion.type,
        title: suggestion.title,
        evidence: suggestion.evidence,
        payload: suggestion.payload as unknown as Prisma.InputJsonValue,
        seq: index,
      })),
    });

    console.log(
      `· ${scenario.key}: 녹음 ${recording.id}${consultation ? ` · 상담 ${consultation.id}` : ' · 연결 대기'}` +
        ` · 제안 ${parsed.suggestions.length}건${fileUrl ? ` · 재생 ${fileUrl}` : ''}`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
