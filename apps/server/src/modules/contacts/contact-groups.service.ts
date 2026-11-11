import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const GROUP_NAME_MAX_LENGTH = 30;
/** 그룹을 고치면 소속 연락처를 한 명씩 감사 기록과 함께 바꾸므로 여유를 둔다. */
const GROUP_REWRITE_TIMEOUT_MS = 60_000;

interface LockedContact {
  id: string;
  tags: string[];
}

/**
 * 사무소가 직접 만드는 연락처 그룹.
 * 소속은 Contact.tags에 그룹 이름으로 저장하고, ContactGroup은 비어 있는 그룹도 남도록 이름만 기억한다.
 *
 * 태그 쓰기 규칙:
 * - updateMany나 원시 UPDATE를 쓰지 않는다. 연락처 변경이 ActivityLog에 남아야 하기 때문이다.
 * - 배열을 통째로 다시 쓰므로 읽기 전에 행을 잠근다. 잠그지 않으면 동시에 들어온 다른 변경이 사라진다.
 *   FOR UPDATE는 트랜잭션 밖 감사 INSERT의 FK 확인과 충돌할 수 있어, UPDATE와 같은 수준인
 *   FOR NO KEY UPDATE를 쓴다. 교착을 막으려고 항상 id 순서로 잠근다.
 */
@Injectable()
export class ContactGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** contactIds를 주면 만들기와 넣기를 한 트랜잭션으로 처리해, 그룹만 남는 상태가 생기지 않는다. */
  async create(officeId: string, rawName: string, contactIds: string[] = []) {
    const name = this.parseNewName(rawName);
    if (await this.exists(officeId, name)) {
      throw new ConflictException('이미 있는 그룹입니다.');
    }
    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          await tx.contactGroup.create({ data: { officeId, name } });
          return contactIds.length > 0
            ? this.addTag(tx, officeId, name, contactIds)
            : 0;
        },
        { timeout: GROUP_REWRITE_TIMEOUT_MS },
      );
      return { name, updated };
    } catch (error) {
      throw this.toConflictIfDuplicate(error);
    }
  }

  async rename(officeId: string, rawName: string, rawNewName: string) {
    const name = await this.requireExisting(officeId, rawName);
    const newName = this.parseNewName(rawNewName);
    if (name === newName) return { name };
    if (await this.exists(officeId, newName)) {
      throw new ConflictException('이미 있는 그룹입니다.');
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const members = await this.lockGroupMembers(tx, officeId, name);
          for (const member of members) {
            await tx.contact.update({
              where: { id: member.id },
              data: {
                tags: Array.from(
                  new Set(
                    member.tags.map((tag) => (tag === name ? newName : tag)),
                  ),
                ),
              },
            });
          }
          await tx.contactGroup.deleteMany({ where: { officeId, name } });
          await tx.contactGroup.create({ data: { officeId, name: newName } });
        },
        { timeout: GROUP_REWRITE_TIMEOUT_MS },
      );
    } catch (error) {
      throw this.toConflictIfDuplicate(error);
    }
    return { name: newName };
  }

  /** 그룹만 없앤다. 소속 연락처는 그대로 두고 그룹 표시만 뗀다. */
  async remove(officeId: string, rawName: string) {
    const name = await this.requireExisting(officeId, rawName);
    const removedFrom = await this.prisma.$transaction(
      async (tx) => {
        const members = await this.lockGroupMembers(tx, officeId, name);
        for (const member of members) {
          await tx.contact.update({
            where: { id: member.id },
            data: { tags: member.tags.filter((tag) => tag !== name) },
          });
        }
        await tx.contactGroup.deleteMany({ where: { officeId, name } });
        return members.length;
      },
      { timeout: GROUP_REWRITE_TIMEOUT_MS },
    );
    return { removedFrom };
  }

  async addMembers(officeId: string, rawName: string, contactIds: string[]) {
    const name = await this.requireExisting(officeId, rawName);
    const updated = await this.prisma.$transaction(
      async (tx) => {
        await this.rememberGroup(tx, officeId, name);
        return this.addTag(tx, officeId, name, contactIds);
      },
      { timeout: GROUP_REWRITE_TIMEOUT_MS },
    );
    return { updated };
  }

  async removeMembers(officeId: string, rawName: string, contactIds: string[]) {
    const name = await this.requireExisting(officeId, rawName);
    const updated = await this.prisma.$transaction(
      async (tx) => {
        // 마지막 사람을 빼도 사용자가 관리하던 그룹이 사라지지 않게 이름을 남긴다.
        await this.rememberGroup(tx, officeId, name);
        const contacts = await this.lockContacts(tx, officeId, contactIds);
        const members = contacts.filter(({ tags }) => tags.includes(name));
        for (const member of members) {
          await tx.contact.update({
            where: { id: member.id },
            data: { tags: member.tags.filter((tag) => tag !== name) },
          });
        }
        return members.length;
      },
      { timeout: GROUP_REWRITE_TIMEOUT_MS },
    );
    return { updated };
  }

  private async addTag(
    tx: Prisma.TransactionClient,
    officeId: string,
    name: string,
    contactIds: string[],
  ) {
    const contacts = await this.lockContacts(tx, officeId, contactIds);
    const newMembers = contacts.filter(({ tags }) => !tags.includes(name));
    for (const contact of newMembers) {
      await tx.contact.update({
        where: { id: contact.id },
        data: { tags: [...contact.tags, name] },
      });
    }
    return newMembers.length;
  }

  private lockContacts(
    tx: Prisma.TransactionClient,
    officeId: string,
    contactIds: string[],
  ) {
    return tx.$queryRaw<LockedContact[]>`
      SELECT "id", "tags"
      FROM "contacts"
      WHERE "office_id" = ${officeId}::uuid
        AND "id" = ANY(${contactIds}::uuid[])
      ORDER BY "id"
      FOR NO KEY UPDATE
    `;
  }

  private lockGroupMembers(
    tx: Prisma.TransactionClient,
    officeId: string,
    name: string,
  ) {
    return tx.$queryRaw<LockedContact[]>`
      SELECT "id", "tags"
      FROM "contacts"
      WHERE "office_id" = ${officeId}::uuid
        AND ${name}::text = ANY("tags")
      ORDER BY "id"
      FOR NO KEY UPDATE
    `;
  }

  private rememberGroup(
    tx: Prisma.TransactionClient,
    officeId: string,
    name: string,
  ) {
    return tx.contactGroup.createMany({
      data: [{ officeId, name }],
      skipDuplicates: true,
    });
  }

  private async exists(officeId: string, name: string) {
    const [registered, members] = await Promise.all([
      this.prisma.contactGroup.count({ where: { officeId, name } }),
      this.prisma.contact.count({ where: { officeId, tags: { has: name } } }),
    ]);
    return registered > 0 || members > 0;
  }

  /**
   * 화면이 목록에서 받은 이름을 그대로 보내므로 그대로 찾는다.
   * 다듬으면 '경합C ' 태그를 지우려다 다른 그룹 '경합C'를 지우게 된다.
   */
  private async requireExisting(officeId: string, name: string) {
    if (!name || !(await this.exists(officeId, name))) {
      throw new NotFoundException('그룹을 찾을 수 없습니다.');
    }
    return name;
  }

  private parseNewName(rawName: string) {
    const name = rawName?.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('그룹 이름을 입력하세요.');
    if (name.length > GROUP_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `그룹 이름은 ${GROUP_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
      );
    }
    // 목록 조회의 tags 파라미터가 쉼표로 값을 나누므로 이름에 쉼표가 있으면 찾을 수 없다.
    if (name.includes(',')) {
      throw new BadRequestException('그룹 이름에는 쉼표를 쓸 수 없습니다.');
    }
    return name;
  }

  private toConflictIfDuplicate(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
      ? new ConflictException('이미 있는 그룹입니다.')
      : error;
  }
}
