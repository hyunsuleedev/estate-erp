import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const GROUP_NAME_MAX_LENGTH = 30;

/**
 * 사무소가 직접 만드는 연락처 그룹(VIP, 설 선물 등).
 *
 * 그룹과 태그는 다른 것이다. 소속은 ContactGroupMember의 한 줄이고 태그(ContactTag)와 무관하다.
 * 태그 칸에 그룹과 같은 글자를 적어도 그룹에 들어가지 않고, 그룹에 넣어도 태그가 생기지 않는다.
 * 그래서 이름을 바꾸거나 지울 때 연락처를 다시 쓰지 않는다.
 *
 * 화면은 그룹을 이름으로 가리킨다(사무소 안에서 이름이 유일하다).
 */
@Injectable()
export class ContactGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** contactIds를 주면 만들기와 넣기를 한 트랜잭션으로 처리해, 그룹만 남는 상태가 생기지 않는다. */
  async create(
    officeId: string,
    rawName: string,
    contactIds: string[] = [],
    addedById?: string,
  ) {
    const name = this.parseNewName(rawName);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const group = await tx.contactGroup.create({
          data: { officeId, name },
        });
        return this.insertMembers(tx, officeId, group.id, contactIds, addedById);
      });
      return { name, updated };
    } catch (error) {
      throw this.toConflictIfDuplicate(error);
    }
  }

  async rename(officeId: string, rawName: string, rawNewName: string) {
    const group = await this.requireExisting(officeId, rawName);
    const newName = this.parseNewName(rawNewName);
    if (group.name === newName) return { name: newName };
    let count: number;
    try {
      // 읽은 이름이 그대로일 때만 바꾼다. 조건 없이 id로 바꾸면, 같은 그룹을 동시에 바꾼
      // 두 요청 가운데 먼저 저장된 이름이 말없이 덮인다.
      ({ count } = await this.prisma.contactGroup.updateMany({
        where: { id: group.id, officeId, name: group.name },
        data: { name: newName },
      }));
    } catch (error) {
      throw this.toConflictIfDuplicate(error);
    }
    if (count === 0) throw this.changedMeanwhile();
    return { name: newName };
  }

  /** 그룹만 없앤다. 소속은 함께 지워지고(DB cascade) 연락처는 그대로 남는다. */
  async remove(officeId: string, rawName: string) {
    const group = await this.requireExisting(officeId, rawName);
    const removedFrom = await this.prisma.$transaction(async (tx) => {
      const count = await tx.contactGroupMember.count({
        where: { officeId, groupId: group.id },
      });
      // 화면이 본 이름의 그룹만 지운다. 그 사이 다른 사람이 이름을 바꿨으면 지우지 않는다.
      const deleted = await tx.contactGroup.deleteMany({
        where: { id: group.id, officeId, name: group.name },
      });
      if (deleted.count === 0) throw this.changedMeanwhile();
      return count;
    });
    return { removedFrom };
  }

  async addMembers(
    officeId: string,
    rawName: string,
    contactIds: string[],
    addedById?: string,
  ) {
    const group = await this.requireExisting(officeId, rawName);
    const updated = await this.prisma.$transaction((tx) =>
      this.insertMembers(tx, officeId, group.id, contactIds, addedById),
    );
    return { updated };
  }

  /** 마지막 사람을 빼도 그룹은 남는다. */
  async removeMembers(officeId: string, rawName: string, contactIds: string[]) {
    const group = await this.requireExisting(officeId, rawName);
    const { count } = await this.prisma.contactGroupMember.deleteMany({
      where: { officeId, groupId: group.id, contactId: { in: contactIds } },
    });
    return { updated: count };
  }

  /** 이 사무소의 연락처만, 아직 속하지 않은 사람만 넣는다. 새로 들어간 수를 돌려준다. */
  private async insertMembers(
    tx: Prisma.TransactionClient,
    officeId: string,
    groupId: string,
    contactIds: string[],
    addedById?: string,
  ) {
    if (contactIds.length === 0) return 0;
    const contacts = await tx.contact.findMany({
      where: { officeId, id: { in: contactIds } },
      select: { id: true },
    });
    if (contacts.length === 0) return 0;
    const { count } = await tx.contactGroupMember.createMany({
      data: contacts.map(({ id }) => ({
        officeId,
        groupId,
        contactId: id,
        addedById: addedById ?? null,
      })),
      // 같은 사람을 동시에 넣어도 한 줄만 남는다 (group_id, contact_id unique).
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * 화면이 목록에서 받은 이름을 그대로 보내므로 그대로 찾는다.
   * 다듬으면 '경합C ' 그룹을 지우려다 다른 그룹 '경합C'를 지우게 된다.
   */
  private async requireExisting(officeId: string, name: string) {
    const group = name
      ? await this.prisma.contactGroup.findFirst({
          where: { officeId, name },
          select: { id: true, name: true },
        })
      : null;
    if (!group) throw new NotFoundException('그룹을 찾을 수 없습니다.');
    return group;
  }

  private changedMeanwhile() {
    return new ConflictException(
      '그 사이 그룹 이름이 바뀌었거나 지워졌습니다. 목록을 새로 고친 뒤 다시 해 주세요.',
    );
  }

  private parseNewName(rawName: string) {
    const name = rawName?.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('그룹 이름을 입력하세요.');
    if (name.length > GROUP_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `그룹 이름은 ${GROUP_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`,
      );
    }
    // 화면이 고른 그룹을 주소에 쉼표로 이어 적을 수 있어 이름에는 쉼표를 받지 않는다.
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
