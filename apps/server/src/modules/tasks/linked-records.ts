import { BadRequestException } from '@nestjs/common';

/**
 * 업무·일정이 가리키는 연락처·매물·거래 등이 같은 사무소의 것인지 확인한다.
 *
 * tasks·calendar_events 의 연결 칸은 (office_id, id) 조합 FK가 아니라서 DB가 다른 사무소의 행을
 * 막지 못한다. 막지 않으면 다른 사무소의 연락처를 연결해 두고 업무 조회(include)로 이름·전화번호를
 * 읽을 수 있다. 그래서 저장하기 전에 서비스에서 확인한다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LinkField {
  key: string;
  /** Prisma 모델 접근자 이름 */
  model: string;
  /** 메시지에 쓰는 이름 + 목적격 조사 */
  object: string;
}

export const TASK_LINK_FIELDS: LinkField[] = [
  { key: 'contactId', model: 'contact', object: '연락처를' },
  { key: 'propertyId', model: 'property', object: '매물을' },
  { key: 'listingIntakeId', model: 'listingIntake', object: '의뢰를' },
  { key: 'listingId', model: 'listing', object: '매물 조건을' },
  { key: 'consultationId', model: 'consultation', object: '상담을' },
  { key: 'buyerIntakeId', model: 'buyerIntake', object: '구매 의뢰를' },
  { key: 'buyerReqId', model: 'buyerRequirement', object: '구매 조건을' },
  { key: 'matchId', model: 'match', object: '매칭을' },
  { key: 'dealId', model: 'deal', object: '거래를' },
  { key: 'contractId', model: 'contract', object: '계약을' },
  // 프로젝트는 조합 FK가 있어 DB도 막지만, 같은 한국어 안내를 주려고 여기서도 본다.
  { key: 'projectId', model: 'project', object: '프로젝트를' },
];

export const EVENT_LINK_FIELDS: LinkField[] = TASK_LINK_FIELDS.filter((field) =>
  ['contactId', 'propertyId', 'listingIntakeId', 'listingId', 'buyerIntakeId', 'matchId', 'dealId', 'projectId'].includes(field.key),
);

type CountDelegate = { count: (args: { where: Record<string, unknown> }) => Promise<number> };

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** 보낸 연결 칸(값이 있는 것)만 확인한다. null·undefined·빈 글은 연결 해제·변경 없음이다. */
export async function assertLinksInOffice(
  prisma: unknown,
  officeId: string,
  dto: object,
  fields: LinkField[],
) {
  const values = dto as Record<string, unknown>;
  await Promise.all(
    fields.map(async (field) => {
      const value = values[field.key];
      if (value === undefined || value === null || value === '') return;
      const message = `연결할 ${field.object} 찾을 수 없습니다.`;
      if (!isUuid(value)) throw new BadRequestException(message);
      const delegate = (prisma as Record<string, CountDelegate>)[field.model];
      const count = await delegate.count({ where: { id: value, officeId } });
      if (count === 0) throw new BadRequestException(message);
    }),
  );
}

/** 같은 사무소의 일하는(차단·퇴사하지 않은) 직원인지 */
export async function isActiveStaffInOffice(prisma: unknown, officeId: string, userId: unknown): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const delegate = (prisma as Record<string, CountDelegate>).user;
  return (await delegate.count({ where: { id: userId, officeId, isActive: true } })) > 0;
}

/** 담당자로 고른 사람이 같은 사무소의 일하는 직원인지 (사람이 고른 담당에 쓴다) */
export async function assertStaffInOffice(prisma: unknown, officeId: string, userId: unknown) {
  if (!(await isActiveStaffInOffice(prisma, officeId, userId))) {
    throw new BadRequestException('담당자로 고른 직원을 찾을 수 없습니다.');
  }
}

/** 날짜 글을 Date로. 비었으면 undefined, 형식이 틀리면 400 */
export function parseDateInput(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
  return date;
}
