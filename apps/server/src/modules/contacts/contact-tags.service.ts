import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CONTACT_TAG_COLORS,
  CONTACT_TAG_NAME_MAX_LENGTH,
  type ContactTagColor,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** 연락처가 가진 태그의 이름만 읽는다. 붙인 순서대로 돌려준다. */
export const CONTACT_TAG_NAMES_INCLUDE = {
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  select: { tag: { select: { name: true } } },
} satisfies Prisma.Contact$tagAssignmentsArgs;

export function toTagNames(assignments: Array<{ tag: { name: string } }>) {
  return assignments.map(({ tag }) => tag.name);
}

/** 조회 결과의 tagAssignments를 화면이 쓰는 tags(이름 배열)로 바꾼다. */
export function withTagNames<T extends { tagAssignments: Array<{ tag: { name: string } }> }>(
  contact: T,
): Omit<T, 'tagAssignments'> & { tags: string[] } {
  const { tagAssignments, ...rest } = contact;
  return { ...rest, tags: toTagNames(tagAssignments) };
}

/** 이름 규칙: 앞뒤 공백을 떼고 가운데 공백을 하나로 줄인다. 쉼표는 목록 조회의 구분자라 받지 않는다. */
export function normalizeContactTagName(rawName: unknown): string {
  const name = typeof rawName === 'string' ? rawName.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new BadRequestException('태그 이름을 입력하세요.');
  if (name.length > CONTACT_TAG_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `태그 이름은 ${CONTACT_TAG_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
    );
  }
  if (name.includes(',')) {
    throw new BadRequestException('태그 이름에는 쉼표를 쓸 수 없습니다.');
  }
  return name;
}

/** 여러 이름을 다듬고 겹치는 것을 하나로 줄인다. 빈 값은 버린다. */
export function normalizeContactTagNames(rawNames: unknown): string[] {
  if (!Array.isArray(rawNames)) {
    throw new BadRequestException('태그는 이름 목록으로 보내야 합니다.');
  }
  const names = rawNames
    .filter((raw) => typeof raw !== 'string' || raw.trim() !== '')
    .map(normalizeContactTagName);
  return Array.from(new Set(names));
}

/**
 * 이름에 해당하는 태그를 찾고, 없는 것은 만든다. 새 태그에는 지금 가장 덜 쓰인 색을 붙인다.
 * 두 요청이 같은 이름을 동시에 만들어도 한 줄만 남는다 (office_id, name unique + skipDuplicates).
 */
export async function ensureContactTags(
  tx: Prisma.TransactionClient,
  officeId: string,
  names: string[],
) {
  if (names.length === 0) return [];
  const existing = await tx.contactTag.findMany({
    where: { officeId },
    select: { name: true, color: true },
  });
  const known = new Set(existing.map(({ name }) => name));
  const missing = names.filter((name) => !known.has(name));
  if (missing.length > 0) {
    const usage = new Map<string, number>(CONTACT_TAG_COLORS.map((color) => [color, 0]));
    for (const { color } of existing) usage.set(color, (usage.get(color) ?? 0) + 1);
    const data = missing.map((name) => {
      // 덜 쓰인 색부터, 같으면 목록 순서대로.
      const color = [...CONTACT_TAG_COLORS].sort(
        (left, right) => (usage.get(left) ?? 0) - (usage.get(right) ?? 0),
      )[0];
      usage.set(color, (usage.get(color) ?? 0) + 1);
      return { officeId, name, color };
    });
    await tx.contactTag.createMany({ data, skipDuplicates: true });
  }
  return tx.contactTag.findMany({
    where: { officeId, name: { in: names } },
    select: { id: true, name: true },
  });
}

/** 한 연락처의 태그를 주어진 이름들로 맞춘다. 없는 태그는 만들고, 빠진 것은 뗀다. */
export async function setContactTags(
  tx: Prisma.TransactionClient,
  officeId: string,
  contactId: string,
  rawNames: unknown,
  addedById?: string,
) {
  const names = normalizeContactTagNames(rawNames);
  const tags = await ensureContactTags(tx, officeId, names);
  const tagIds = tags.map(({ id }) => id);
  await tx.contactTagAssignment.deleteMany({
    where: { officeId, contactId, tagId: { notIn: tagIds } },
  });
  if (tagIds.length > 0) {
    // 요청에 적힌 순서대로 붙도록 이름 순서를 따른다.
    const ordered = names
      .map((name) => tags.find((tag) => tag.name === name))
      .filter((tag): tag is { id: string; name: string } => Boolean(tag));
    await tx.contactTagAssignment.createMany({
      data: ordered.map((tag) => ({
        officeId,
        contactId,
        tagId: tag.id,
        addedById: addedById ?? null,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * 사무소의 연락처 태그. 태그는 그 사람을 설명하는 말이고 그룹(명단)과는 다른 것이다.
 * 화면은 태그를 이름으로 가리킨다(사무소 안에서 이름이 유일하다).
 */
@Injectable()
export class ContactTagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 만든 순서대로. 고르는 창의 목록 순서가 쓸 때마다 바뀌지 않게 한다. */
  async list(officeId: string) {
    const tags = await this.prisma.contactTag.findMany({
      where: { officeId },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { name: true, color: true, _count: { select: { assignments: true } } },
    });
    return tags.map(({ name, color, _count }) => ({
      name,
      color,
      count: _count.assignments,
    }));
  }

  /** 태그를 붙인다. 없는 이름이면 만든다. 이미 붙은 사람은 그대로 둔다. */
  async assign(
    officeId: string,
    rawName: string,
    contactIds: string[],
    addedById?: string,
  ) {
    const name = normalizeContactTagName(rawName);
    return this.prisma.$transaction(async (tx) => {
      const [tag] = await ensureContactTags(tx, officeId, [name]);
      const contacts = await tx.contact.findMany({
        where: { officeId, id: { in: contactIds } },
        select: { id: true },
      });
      const { count } =
        contacts.length > 0
          ? await tx.contactTagAssignment.createMany({
              data: contacts.map(({ id }) => ({
                officeId,
                contactId: id,
                tagId: tag.id,
                addedById: addedById ?? null,
              })),
              skipDuplicates: true,
            })
          : { count: 0 };
      return { name, updated: count };
    });
  }

  /** 태그를 뗀다. 마지막 사람에게서 떼도 태그는 남는다. */
  async unassign(officeId: string, rawName: string, contactIds: string[]) {
    const tag = await this.requireExisting(officeId, rawName);
    const { count } = await this.prisma.contactTagAssignment.deleteMany({
      where: { officeId, tagId: tag.id, contactId: { in: contactIds } },
    });
    return { updated: count };
  }

  async update(
    officeId: string,
    rawName: string,
    changes: { newName?: string; color?: string },
  ) {
    const tag = await this.requireExisting(officeId, rawName);
    const data: Prisma.ContactTagUpdateManyMutationInput = {};
    if (changes.newName !== undefined) {
      data.name = normalizeContactTagName(changes.newName);
    }
    if (changes.color !== undefined) {
      if (!CONTACT_TAG_COLORS.includes(changes.color as ContactTagColor)) {
        throw new BadRequestException('쓸 수 없는 태그 색입니다.');
      }
      data.color = changes.color;
    }
    if (Object.keys(data).length === 0) return { name: tag.name };

    let count: number;
    try {
      // 읽은 이름이 그대로일 때만 바꾼다. 같은 태그를 동시에 바꾼 두 요청 가운데
      // 먼저 저장된 이름이 말없이 덮이지 않게 한다.
      ({ count } = await this.prisma.contactTag.updateMany({
        where: { id: tag.id, officeId, name: tag.name },
        data,
      }));
    } catch (error) {
      throw this.toConflictIfDuplicate(error);
    }
    if (count === 0) throw this.changedMeanwhile();
    return { name: (data.name as string | undefined) ?? tag.name };
  }

  /** 태그를 없앤다. 붙어 있던 연결은 함께 지워지고(DB cascade) 연락처는 남는다. */
  async remove(officeId: string, rawName: string) {
    const tag = await this.requireExisting(officeId, rawName);
    return this.prisma.$transaction(async (tx) => {
      const removedFrom = await tx.contactTagAssignment.count({
        where: { officeId, tagId: tag.id },
      });
      const deleted = await tx.contactTag.deleteMany({
        where: { id: tag.id, officeId, name: tag.name },
      });
      if (deleted.count === 0) throw this.changedMeanwhile();
      return { removedFrom };
    });
  }

  /** 화면이 목록에서 받은 이름을 그대로 보내므로 그대로 찾는다. */
  private async requireExisting(officeId: string, name: string) {
    const tag = name
      ? await this.prisma.contactTag.findFirst({
          where: { officeId, name },
          select: { id: true, name: true },
        })
      : null;
    if (!tag) throw new NotFoundException('태그를 찾을 수 없습니다.');
    return tag;
  }

  private changedMeanwhile() {
    return new ConflictException(
      '그 사이 태그 이름이 바뀌었거나 지워졌습니다. 목록을 새로 고친 뒤 다시 해 주세요.',
    );
  }

  private toConflictIfDuplicate(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
      ? new ConflictException('이미 있는 태그입니다.')
      : error;
  }
}
